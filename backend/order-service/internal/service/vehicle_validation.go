package service

import (
	"context"
	"fmt"
	"tembus/order-service/internal/domain"
)

type vehicleValidatorImpl struct {
	repo domain.AvailabilityRepository
}

func NewVehicleValidator(repo domain.AvailabilityRepository) domain.VehicleValidator {
	return &vehicleValidatorImpl{repo: repo}
}

// vehicleRestrictionMatrix defines which vehicle types are allowed per service
var vehicleRestrictionMatrix = map[string][]string{
	"tambal_ban_motor": {"motor", "bebek", "matic", "sport"},
	"tambal_ban_mobil": {"sedan", "mpv", "suv"},
	"towing_motor":     {"pickup", "van"},
	"towing_mobil":     {"towing_truck"},
}

// targetObjectDescription describes what the service targets
var targetObjectDescription = map[string]string{
	"tambal_ban_motor": "Sepeda Motor",
	"tambal_ban_mobil": "Mobil (sedan/mpv/suv)",
	"towing_motor":     "Sepeda Motor (angkut pakai pickup/van)",
	"towing_mobil":     "Mobil (angkut pakai towing_truck)",
}

func (v *vehicleValidatorImpl) GetAllowedVehicleTypes(serviceSubType string) []string {
	if types, ok := vehicleRestrictionMatrix[serviceSubType]; ok {
		return types
	}
	return nil
}

// ValidateCourierVehicle checks if a courier's vehicle is compatible with the service.
// For tambal_ban: courier vehicle must match target object type.
// For towing: courier vehicle must be the specified transport vehicle.
func (v *vehicleValidatorImpl) ValidateCourierVehicle(ctx context.Context, courierID, serviceSubType string) (bool, error) {
	allowedTypes := v.GetAllowedVehicleTypes(serviceSubType)
	if allowedTypes == nil {
		return false, fmt.Errorf("unknown service sub type: %s", serviceSubType)
	}

	// Query courier_profiles for actual vehicle info
	vehicleType, vehicleTypeCar, err := v.repo.GetCourierVehicleType(ctx, courierID)
	if err != nil {
		return false, fmt.Errorf("failed to get courier vehicle: %w", err)
	}

	// For tambal_ban services: check against vehicle_type (motor types)
	// For towing services: check against vehicle_type_car (car/transport types)
	if IsTambalBan(serviceSubType) {
		// Tambal ban targets the customer's vehicle — courier must have a compatible vehicle
		// to reach the location. Motor couriers handle motor tambal ban, car couriers handle mobil.
		for _, allowed := range allowedTypes {
			if vehicleType == allowed {
				return true, nil
			}
		}
	}

	if IsTowing(serviceSubType) {
		// Towing requires specific transport vehicle (pickup, van, towing_truck)
		// Check against vehicle_type_car since towing uses car-type vehicles
		if vehicleTypeCar != nil {
			for _, allowed := range allowedTypes {
				if *vehicleTypeCar == allowed {
					return true, nil
				}
			}
		}
	}

	return false, nil
}

// GetTargetObjectDescription returns a human-readable description of what the service targets
func GetTargetObjectDescription(serviceSubType string) string {
	if desc, ok := targetObjectDescription[serviceSubType]; ok {
		return desc
	}
	return "Unknown"
}

// IsTambalBan returns true if the service is a tambal ban service
func IsTambalBan(serviceSubType string) bool {
	return serviceSubType == "tambal_ban_motor" || serviceSubType == "tambal_ban_mobil"
}

// IsTowing returns true if the service is a towing service
func IsTowing(serviceSubType string) bool {
	return serviceSubType == "towing_motor" || serviceSubType == "towing_mobil"
}

// IsTambalBanOrTowing returns true if the service is tambal ban or towing
func IsTambalBanOrTowing(serviceSubType string) bool {
	return IsTambalBan(serviceSubType) || IsTowing(serviceSubType)
}
