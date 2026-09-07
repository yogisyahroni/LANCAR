package routing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

var ErrZoneNotFound = errors.New("active zone not found for coordinate")

const (
	DefaultMarketCode = "ID-JK"
	zoneLookupQuery   = `
		SELECT code
		FROM zones
		WHERE is_active = TRUE
		  AND market_code = $3
		  AND ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
		ORDER BY updated_at DESC
		LIMIT 1
	`
)

type ZoneResolver interface {
	ResolveZoneCode(ctx context.Context, coord Coordinate) (string, error)
}

type PostgresZoneResolver struct {
	db         *sql.DB
	marketCode string
}

func NewPostgresZoneResolver(db *sql.DB) *PostgresZoneResolver {
	return NewPostgresZoneResolverForMarket(db, DefaultMarketCode)
}

func NewPostgresZoneResolverForMarket(db *sql.DB, marketCode string) *PostgresZoneResolver {
	marketCode = strings.TrimSpace(marketCode)
	if marketCode == "" {
		marketCode = DefaultMarketCode
	}
	return &PostgresZoneResolver{db: db, marketCode: marketCode}
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
	err := r.db.QueryRowContext(ctx, zoneLookupQuery, coord.Lng, coord.Lat, r.marketCode).Scan(&zoneCode)
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
