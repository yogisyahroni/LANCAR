package handler

import (
	"errors"
	"testing"
)

func TestCustomerRegistrationErrorMessageKeepsDuplicateAccountActionable(t *testing.T) {
	got := customerRegistrationErrorMessage(errors.New("email is already registered"))
	want := "Email atau nomor handphone sudah terdaftar. Silakan masuk dengan akun tersebut."
	if got != want {
		t.Fatalf("customerRegistrationErrorMessage() = %q, want %q", got, want)
	}
}

func TestCustomerRegistrationErrorMessageDoesNotExposeInternalDetails(t *testing.T) {
	got := customerRegistrationErrorMessage(errors.New("pq: duplicate key value violates unique constraint users_email_key"))
	if got == "pq: duplicate key value violates unique constraint users_email_key" {
		t.Fatal("internal database error leaked to the client")
	}
}
