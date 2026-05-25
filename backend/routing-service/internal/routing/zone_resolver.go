package routing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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
	if r == nil || r.db == nil {
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
		return "", ErrZoneNotFound
	}
	if err != nil {
		return "", err
	}

	return zoneCode, nil
}
