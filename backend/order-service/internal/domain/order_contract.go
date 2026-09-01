package domain

import "strings"

// CanonicalServiceCategory is intentionally separate from the legacy delivery
// product categories. It is the stable category used by every order surface.
type CanonicalServiceCategory string

const (
	CanonicalPackageOnDemand CanonicalServiceCategory = "package_on_demand"
	CanonicalFood            CanonicalServiceCategory = "food"
	CanonicalTambalBan       CanonicalServiceCategory = "tambal_ban"
	CanonicalAggregator      CanonicalServiceCategory = "aggregator"
	CanonicalTowing          CanonicalServiceCategory = "towing"
)

const CurrentOrderContractVersion = "2026-09-01"

type OrderActorOwnership struct {
	CustomerID string  `json:"customer_id,omitempty"`
	MerchantID *string `json:"merchant_id,omitempty"`
	CourierID  *string `json:"courier_id,omitempty"`
}

type ParcelFacts struct {
	Category        string  `json:"category,omitempty"`
	ItemDescription string  `json:"item_description,omitempty"`
	ItemImageURL    string  `json:"item_image_url,omitempty"`
	LengthCM        float64 `json:"length_cm,omitempty"`
	WidthCM         float64 `json:"width_cm,omitempty"`
	HeightCM        float64 `json:"height_cm,omitempty"`
	WeightKG        float64 `json:"weight_kg,omitempty"`
}

type FoodFacts struct {
	MerchantID      *string `json:"merchant_id,omitempty"`
	MerchantName    *string `json:"merchant_name,omitempty"`
	PrepTimeMinutes *int    `json:"prep_time_minutes,omitempty"`
	Contactless     bool    `json:"contactless"`
}

type RoadsideFacts struct {
	ServiceSubType string         `json:"service_sub_type,omitempty"`
	VehicleFacts   map[string]any `json:"vehicle_facts,omitempty"`
}

type AggregatorFacts struct {
	Provider    string `json:"provider,omitempty"`
	ServiceType string `json:"service_type,omitempty"`
	TariffIDR   int64  `json:"tariff_idr,omitempty"`
	NetCostIDR  int64  `json:"net_cost_idr,omitempty"`
	AWB         string `json:"awb_number,omitempty"`
}

type TowingFacts struct {
	ServiceSubType string         `json:"service_sub_type,omitempty"`
	VehicleFacts   map[string]any `json:"vehicle_facts,omitempty"`
}

type OrderServiceMetadata struct {
	Parcel     *ParcelFacts     `json:"parcel,omitempty"`
	Food       *FoodFacts       `json:"food,omitempty"`
	Roadside   *RoadsideFacts   `json:"roadside,omitempty"`
	Aggregator *AggregatorFacts `json:"aggregator,omitempty"`
	Towing     *TowingFacts     `json:"towing,omitempty"`
}

// CanonicalServiceCategoryFor returns nil for a genuinely unknown legacy
// record. Callers can render that record degraded-safe without inventing a
// service identity.
func CanonicalServiceCategoryFor(o *Order) *CanonicalServiceCategory {
	if o == nil {
		return nil
	}
	rawCategory := strings.ToLower(strings.TrimSpace(string(o.ServiceCategory)))
	switch rawCategory {
	case string(CanonicalPackageOnDemand), "on_demand", "regular", "network":
		category := CanonicalPackageOnDemand
		return &category
	case string(CanonicalFood), "food_delivery":
		category := CanonicalFood
		return &category
	case string(CanonicalTambalBan):
		category := CanonicalTambalBan
		return &category
	case string(CanonicalAggregator):
		category := CanonicalAggregator
		return &category
	case string(CanonicalTowing):
		category := CanonicalTowing
		return &category
	}

	subtype := strings.ToLower(strings.TrimSpace(o.ServiceSubType))
	switch {
	case subtype == "food_delivery":
		category := CanonicalFood
		return &category
	case strings.HasPrefix(subtype, "tambal_ban"):
		category := CanonicalTambalBan
		return &category
	case strings.HasPrefix(subtype, "towing"):
		category := CanonicalTowing
		return &category
	case strings.TrimSpace(o.LogisticsProvider) != "" || strings.EqualFold(o.Model, "aggregator"):
		category := CanonicalAggregator
		return &category
	case strings.Contains(strings.ToLower(o.Model), "p2p") ||
		strings.EqualFold(o.Model, "two_legs") ||
		strings.EqualFold(o.Model, "three_legs") ||
		strings.EqualFold(o.Model, "hub_and_spoke"):
		category := CanonicalPackageOnDemand
		return &category
	default:
		return nil
	}
}

func BuildOrderServiceMetadata(o *Order) OrderServiceMetadata {
	metadata := OrderServiceMetadata{}
	category := CanonicalServiceCategoryFor(o)
	if category == nil {
		return metadata
	}

	switch *category {
	case CanonicalPackageOnDemand:
		metadata.Parcel = &ParcelFacts{
			Category:        o.ItemCategory,
			ItemDescription: o.ItemDescription,
			ItemImageURL:    o.ItemImageURL,
			LengthCM:        o.Length,
			WidthCM:         o.Width,
			HeightCM:        o.Height,
			WeightKG:        o.Weight,
		}
	case CanonicalFood:
		metadata.Food = &FoodFacts{
			MerchantID:      o.MerchantID,
			MerchantName:    o.MerchantName,
			PrepTimeMinutes: o.PrepTimeMinutes,
			Contactless:     o.Contactless,
		}
	case CanonicalTambalBan:
		metadata.Roadside = &RoadsideFacts{
			ServiceSubType: o.ServiceSubType,
			VehicleFacts:   tambalBanVehicleFacts(o.TambalBanReport),
		}
	case CanonicalAggregator:
		metadata.Aggregator = &AggregatorFacts{
			Provider:    o.LogisticsProvider,
			ServiceType: o.LogisticsServiceType,
			TariffIDR:   o.LogisticsTariffIDR,
			NetCostIDR:  o.LogisticsNetCostIDR,
			AWB:         o.AWB,
		}
	case CanonicalTowing:
		metadata.Towing = &TowingFacts{
			ServiceSubType: o.ServiceSubType,
			VehicleFacts:   towingVehicleFacts(o.TowingReport),
		}
	}
	return metadata
}

func tambalBanVehicleFacts(report *TambalBanReport) map[string]any {
	if report == nil {
		return nil
	}
	facts := map[string]any{}
	if report.TireConditionBefore != nil && *report.TireConditionBefore != "" {
		facts["tire_condition_before"] = *report.TireConditionBefore
	}
	if report.TireConditionAfter != nil && *report.TireConditionAfter != "" {
		facts["tire_condition_after"] = *report.TireConditionAfter
	}
	if report.ServiceDurationMins != nil {
		facts["service_duration_minutes"] = *report.ServiceDurationMins
	}
	if len(report.MaterialsUsedItems) > 0 {
		facts["materials_used_items"] = report.MaterialsUsedItems
	}
	if len(facts) == 0 {
		return nil
	}
	return facts
}

func towingVehicleFacts(report *TowingReport) map[string]any {
	if report == nil {
		return nil
	}
	facts := map[string]any{}
	if report.VehicleID != "" {
		facts["vehicle_id"] = report.VehicleID
	}
	if report.VehicleConditionBefore != nil && *report.VehicleConditionBefore != "" {
		facts["vehicle_condition_before"] = *report.VehicleConditionBefore
	}
	if report.OdometerReading != nil {
		facts["odometer_reading"] = *report.OdometerReading
	}
	if report.OdometerAfter != nil {
		facts["odometer_after"] = *report.OdometerAfter
	}
	if report.DamageReport != nil {
		facts["damage_report"] = report.DamageReport
	}
	if len(facts) == 0 {
		return nil
	}
	return facts
}

func (o *Order) ApplyCanonicalOrderContract() {
	if o == nil {
		return
	}
	if o.ContractVersion == "" {
		o.ContractVersion = CurrentOrderContractVersion
	}
	if o.StateVersion < 1 {
		o.StateVersion = 1
	}
	category := CanonicalServiceCategoryFor(o)
	if category != nil {
		o.ServiceCategory = *category
	}
	o.ActorOwnership = OrderActorOwnership{
		CustomerID: o.CustomerID,
		MerchantID: o.MerchantID,
		CourierID:  o.CourierID,
	}
	if o.ServiceMetadata.Parcel == nil && o.ServiceMetadata.Food == nil &&
		o.ServiceMetadata.Roadside == nil && o.ServiceMetadata.Aggregator == nil &&
		o.ServiceMetadata.Towing == nil {
		o.ServiceMetadata = BuildOrderServiceMetadata(o)
	}
}
