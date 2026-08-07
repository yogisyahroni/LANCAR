package util

// FB-085 Number Masking — penyamaran nomor telepon antar pihak (UU PDP).
// Format: 0812-XXXX-XX34 (4 digit awal + XXXX + XX + 2 digit akhir).
// Dipakai untuk nomor pihak LAIN di payload API; nomor sendiri tetap asli.

// IsPhoneMasked mendeteksi apakah nomor sudah dalam bentuk ter-mask
// (mengandung 'X' atau '*').
func IsPhoneMasked(phone string) bool {
	for _, r := range phone {
		if r == 'X' || r == '*' || r == 'x' {
			return true
		}
	}
	return false
}

// MaskPhone menyamarkan nomor telepon Indonesia.
// Aturan:
//   - Hanya digit yang diperhitungkan; separator (-, spasi, +62) diabaikan.
//   - < 8 digit → return apa adanya (terlalu pendek, tidak bisa di-mask aman).
//   - ≥ 8 digit → 4 digit awal + "-XXXX-XX" + 2 digit akhir.
//
// Contoh: "081234567890" → "0812-XXXX-XX90"; "+62 812-3456-7890" → "0812-XXXX-XX90".
// Idempotent: input yang sudah ter-mask tidak di-mask ulang.
func MaskPhone(phone string) string {
	if phone == "" || IsPhoneMasked(phone) {
		return phone
	}
	digits := make([]rune, 0, len(phone))
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) < 8 {
		return phone
	}
	return string(digits[:4]) + "-XXXX-XX" + string(digits[len(digits)-2:])
}
