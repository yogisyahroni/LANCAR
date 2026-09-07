package domain

import (
	"math"
	"testing"
)

func validLocation() Location {
	return Location{
		DisplayAddress: "Jl. Sudirman No. 10, Jakarta Selatan",
		NormalizedAddress: NormalizedAddress{
			AddressLine: "Jl. Sudirman No. 10",
			City:        "Jakarta Selatan",
			District:    "Setiabudi",
			PostalCode:  "12910",
			CountryCode: "ID",
		},
		Coordinate:        Coordinate{Lat: -6.2, Lng: 106.8},
		Source:            "server_geocode",
		Timezone:          "Asia/Jakarta",
		Market:            "ID-JK",
		AddressVersion:    "location-v3",
		CoordinateVersion: "location-v3",
	}
}

func TestCoordinateRejectsInvalidTransactionalValues(t *testing.T) {
	for name, coordinate := range map[string]Coordinate{
		"zero coordinate": {Lat: 0, Lng: 0},
		"nan latitude":    {Lat: math.NaN(), Lng: 106.8},
		"infinite lng":    {Lat: -6.2, Lng: math.Inf(1)},
		"latitude range":  {Lat: 91, Lng: 106.8},
		"longitude range": {Lat: -6.2, Lng: 181},
	} {
		t.Run(name, func(t *testing.T) {
			if err := coordinate.ValidateTransactional(); err == nil {
				t.Fatal("expected invalid coordinate")
			}
		})
	}
}

func TestLocationRequiresSynchronizedAddressAndCoordinateVersions(t *testing.T) {
	location := validLocation()
	if _, err := location.Revision(); err != nil {
		t.Fatalf("valid location rejected: %v", err)
	}

	location.CoordinateVersion = "location-v4"
	if _, err := location.Revision(); err == nil {
		t.Fatal("expected mismatched versions to be rejected")
	}
}

func TestLocationRevisionChangesWithAddressOrCoordinate(t *testing.T) {
	base := validLocation()
	addressChanged := base
	addressChanged.DisplayAddress = "Jl. Sudirman No. 11, Jakarta Selatan"
	coordinateChanged := base
	coordinateChanged.Coordinate.Lng = 106.801

	if base.SameRevision(addressChanged) {
		t.Fatal("address change reused location revision")
	}
	if base.SameRevision(coordinateChanged) {
		t.Fatal("coordinate change reused location revision")
	}
}
