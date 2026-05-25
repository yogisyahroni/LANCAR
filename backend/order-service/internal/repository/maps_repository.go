package repository

import (
	"context"
	"fmt"
	"lancar/order-service/internal/domain"

	"googlemaps.github.io/maps"
)

type mapsRepo struct {
	client *maps.Client
}

func NewMapsRepository(apiKey string) (domain.MapsRepository, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("GOOGLE_MAPS_API_KEY is not configured")
	}

	c, err := maps.NewClient(maps.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	return &mapsRepo{client: c}, nil
}

func (r *mapsRepo) GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64) (float64, float64, string, string, error) {
	req := &maps.DistanceMatrixRequest{
		Origins:      []string{fmt.Sprintf("%f,%f", originLat, originLng)},
		Destinations: []string{fmt.Sprintf("%f,%f", destLat, destLng)},
		Units:        maps.UnitsMetric,
		Mode:         maps.TravelModeDriving,
	}

	resp, err := r.client.DistanceMatrix(ctx, req)
	if err != nil {
		return 0, 0, "", "", err
	}

	if len(resp.Rows) == 0 || len(resp.Rows[0].Elements) == 0 {
		return 0, 0, "", "", fmt.Errorf("no routes found")
	}

	element := resp.Rows[0].Elements[0]
	if element.Status != "OK" {
		return 0, 0, "", "", fmt.Errorf("maps api error: %s", element.Status)
	}

	distKM := float64(element.Distance.Meters) / 1000.0
	durMin := element.Duration.Minutes()
	originAddr := resp.OriginAddresses[0]
	destAddr := resp.DestinationAddresses[0]

	return distKM, durMin, originAddr, destAddr, nil
}
