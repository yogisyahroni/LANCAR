package routing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

var ErrZoneNotFound = errors.New("active zone not found for coordinate")

type ZoneResolver interface {
	ResolveZoneCode(ctx context.Context, coord Coordinate) (string, error)
}

type PostgresZoneResolver struct {
	db *sql.DB
}

func NewPostgresZoneResolver(db *sql.DB) *PostgresZoneResolver {
	return &PostgresZoneResolver{db: db}
}

func (r *PostgresZoneResolver) ResolveZoneCode(ctx context.Context, coord Coordinate) (string, error) {
	ctx, span := routingTracer.Start(ctx, "routing.zone.lookup")
	defer span.End()
	span.SetAttributes(attribute.String("route.provider", "postgis"))

	if r == nil || r.db == nil {
		span.SetAttributes(attribute.Bool("zone.resolved", false))
		span.SetStatus(codes.Error, "zone resolver database missing")
		return "", fmt.Errorf("postgres zone resolver database is not configured")
	}

	var zoneCode string
	query := `
		SELECT code
		FROM zones
		WHERE is_active = TRUE
		  AND ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
		ORDER BY updated_at DESC
		LIMIT 1
	`
	err := r.db.QueryRowContext(ctx, query, coord.Lng, coord.Lat).Scan(&zoneCode)
	if errors.Is(err, sql.ErrNoRows) {
		span.SetAttributes(attribute.Bool("zone.resolved", false))
		span.SetStatus(codes.Error, "zone not found")
		return "", ErrZoneNotFound
	}
	if err != nil {
		span.SetAttributes(attribute.Bool("zone.resolved", false))
		span.SetStatus(codes.Error, "zone lookup failed")
		return "", err
	}

	span.SetAttributes(attribute.Bool("zone.resolved", true))
	span.SetStatus(codes.Ok, "")
	return zoneCode, nil
}
