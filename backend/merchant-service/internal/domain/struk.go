package domain

// StrukData — data struk pembelian food untuk merchant (FOOD-BIKE-034).
// Struk berisi rincian item, harga, ongkir, nomor order, dan QR code
// (berisi handover token — sama dengan yang di-scan driver saat pickup,
// konsisten dengan FOOD-BIKE-032 & 069).
type StrukData struct {
	OrderID         string              `json:"order_id"`
	OrderNumber     string              `json:"order_number"`
	Status          string              `json:"status"`
	MerchantName    string              `json:"merchant_name"`
	MerchantAddress string              `json:"merchant_address,omitempty"`
	CustomerName    string              `json:"customer_name,omitempty"`
	DropoffAddress  string              `json:"dropoff_address,omitempty"`
	HandoverToken   string              `json:"handover_token"`
	QRCodeDataURI   string              `json:"qr_code_data_uri"`
	SubtotalIDR     int64               `json:"subtotal_idr"`
	DeliveryFeeIDR  int64               `json:"delivery_fee_idr"`
	TotalPriceIDR   int64               `json:"total_price_idr"`
	CreatedAt       string              `json:"created_at"`
	Items           []FoodOrderItemView `json:"items"`
}
