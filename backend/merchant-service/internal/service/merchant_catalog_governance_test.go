package service

import (
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

func TestSlugifyMenuCategory(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "normalizes punctuation", in: "  Makanan & Minuman  ", want: "makanan-minuman"},
		{name: "keeps unicode as separators", in: "Nasi Padang 24", want: "nasi-padang-24"},
		{name: "rejects symbols only", in: "!!!", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := slugifyMenuCategory(tt.in); got != tt.want {
				t.Fatalf("slugifyMenuCategory(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestBuildMenuImagesCanonicalizesPrimaryAndFallback(t *testing.T) {
	fallback := "/merchant-uploads/legacy.jpg"
	images, err := buildMenuImages(nil, &fallback)
	if err != nil {
		t.Fatalf("buildMenuImages fallback: %v", err)
	}
	if len(images) != 1 || !images[0].IsPrimary || images[0].URL != fallback {
		t.Fatalf("unexpected fallback image: %+v", images)
	}

	images, err = buildMenuImages([]domain.MenuItemImageInput{
		{URL: "https://cdn.example/a.jpg"},
		{URL: "https://cdn.example/b.jpg"},
	}, nil)
	if err != nil {
		t.Fatalf("buildMenuImages implicit primary: %v", err)
	}
	if len(images) != 2 || !images[0].IsPrimary || images[1].IsPrimary {
		t.Fatalf("expected first image to be implicit primary: %+v", images)
	}

	if _, err := buildMenuImages([]domain.MenuItemImageInput{
		{URL: "https://cdn.example/a.jpg", IsPrimary: true},
		{URL: "https://cdn.example/b.jpg", IsPrimary: true},
	}, nil); err == nil || !strings.Contains(err.Error(), "primary") {
		t.Fatalf("expected duplicate primary validation, got %v", err)
	}
}

func TestBuildMenuSchedulesSupportsOvernightAndRejectsDuplicates(t *testing.T) {
	schedules, err := buildMenuSchedules([]domain.MenuItemScheduleInput{
		{Weekday: 6, StartsAt: "18:00", EndsAt: "02:00"},
	})
	if err != nil {
		t.Fatalf("overnight schedule rejected: %v", err)
	}
	if len(schedules) != 1 || schedules[0].StartsAt != "18:00" || schedules[0].EndsAt != "02:00" {
		t.Fatalf("unexpected overnight schedule: %+v", schedules)
	}

	_, err = buildMenuSchedules([]domain.MenuItemScheduleInput{
		{Weekday: 1, StartsAt: "08:00", EndsAt: "12:00"},
		{Weekday: 1, StartsAt: "08:00", EndsAt: "12:00"},
	})
	if err == nil || !strings.Contains(err.Error(), "duplikat") {
		t.Fatalf("expected duplicate schedule validation, got %v", err)
	}
}

func TestValidMenuLifecycleStatus(t *testing.T) {
	for _, status := range []string{
		domain.MenuItemStatusDraft,
		domain.MenuItemStatusActive,
		domain.MenuItemStatusSoldOut,
		domain.MenuItemStatusScheduled,
		domain.MenuItemStatusArchived,
	} {
		if !validMenuLifecycleStatus(status) {
			t.Errorf("expected lifecycle status %q to be valid", status)
		}
	}
	for _, status := range []string{"", "pending", "moderation_pending", "deleted"} {
		if validMenuLifecycleStatus(status) {
			t.Errorf("expected lifecycle status %q to be invalid", status)
		}
	}
}
