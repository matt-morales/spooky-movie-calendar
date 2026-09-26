package main

import (
	"testing"
	"time"
)

const page = `{
  "documents": [
    {"name": "projects/p/databases/(default)/documents/ratings/7_abc",
     "fields": {"movieId": {"stringValue": "7"}, "userId": {"stringValue": "abc"},
                "value": {"integerValue": "8"},
                "createdAt": {"timestampValue": "2025-10-07T01:00:00Z"},
                "updatedAt": {"timestampValue": "2025-10-08T02:00:00Z"}}},
    {"name": "projects/p/databases/(default)/documents/ratings/31_xyz",
     "fields": {"movieId": {"stringValue": "31"}, "userId": {"stringValue": "xyz"},
                "value": {"integerValue": "4"},
                "createdAt": {"timestampValue": "2025-10-31T01:00:00Z"}}},
    {"name": "bad value",
     "fields": {"movieId": {"stringValue": "1"}, "userId": {"stringValue": "u"}, "value": {"integerValue": "7"}}},
    {"name": "bad movie",
     "fields": {"movieId": {"stringValue": "99"}, "userId": {"stringValue": "u"}, "value": {"integerValue": "8"}}},
    {"name": "no user",
     "fields": {"movieId": {"stringValue": "1"}, "value": {"integerValue": "8"}}}
  ],
  "nextPageToken": "next-please"
}`

func TestParsePage(t *testing.T) {
	ratings, skipped, next, err := parsePage([]byte(page), 2025)
	if err != nil {
		t.Fatal(err)
	}
	if next != "next-please" || skipped != 3 || len(ratings) != 2 {
		t.Fatalf("next=%q skipped=%d ratings=%+v", next, skipped, ratings)
	}

	r := ratings[0]
	if r.movie != "2025-07" || r.visitor != "firebase:abc" || r.value != 8 ||
		!r.at.Equal(time.Date(2025, 10, 8, 2, 0, 0, 0, time.UTC)) {
		t.Errorf("first = %+v", r)
	}
	// Falls back to createdAt when there's no updatedAt.
	if ratings[1].movie != "2025-31" || !ratings[1].at.Equal(time.Date(2025, 10, 31, 1, 0, 0, 0, time.UTC)) {
		t.Errorf("second = %+v", ratings[1])
	}
}
