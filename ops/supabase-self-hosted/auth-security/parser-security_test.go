package pgproto3

import (
	"bytes"
	"testing"
)

func TestWorkoutDataRowLengths(t *testing.T) {
	cases := []struct {
		name string
		input []byte
		wantError bool
		want [][]byte
	}{
		{"missing_count", nil, true, nil},
		{"short_count", []byte{0}, true, nil},
		{"empty_row", []byte{0, 0}, false, [][]byte{}},
		{"missing_field_length", []byte{0, 1}, true, nil},
		{"short_field_length", []byte{0, 1, 0, 0, 0}, true, nil},
		{"null", []byte{0, 1, 255, 255, 255, 255}, false, [][]byte{nil}},
		{"empty_value", []byte{0, 1, 0, 0, 0, 0}, false, [][]byte{{}}},
		{"text", []byte{0, 1, 0, 0, 0, 1, 'A'}, false, [][]byte{[]byte("A")}},
		{"truncated_value", []byte{0, 1, 0, 0, 0, 2, 'A'}, true, nil},
		{"negative_two", []byte{0, 1, 255, 255, 255, 254}, true, nil},
		{"minimum_int32", []byte{0, 1, 128, 0, 0, 0}, true, nil},
		{"maximum_int32", []byte{0, 1, 127, 255, 255, 255}, true, nil},
		{"missing_second_value", []byte{0, 2, 255, 255, 255, 255}, true, nil},
		{"null_then_text", []byte{0, 2, 255, 255, 255, 255, 0, 0, 0, 1, 'B'}, false, [][]byte{nil, []byte("B")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if value := recover(); value != nil {
					t.Fatalf("unexpected parser panic: %v", value)
				}
			}()
			var row DataRow
			err := row.Decode(tc.input)
			if (err != nil) != tc.wantError {
				t.Fatalf("error=%v; wantError=%v", err, tc.wantError)
			}
			if !tc.wantError {
				if len(row.Values) != len(tc.want) {
					t.Fatalf("wrong field count: %d", len(row.Values))
				}
				for i := range tc.want {
					if !bytes.Equal(row.Values[i], tc.want[i]) || (row.Values[i] == nil) != (tc.want[i] == nil) {
						t.Fatalf("wrong value at field %d", i)
					}
				}
			}
		})
	}
}

func FuzzWorkoutDataRow(f *testing.F) {
	f.Add([]byte{0, 1, 255, 255, 255, 254})
	f.Add([]byte{0, 1, 128, 0, 0, 0})
	f.Add([]byte{0, 1, 255, 255, 255, 255})
	f.Add([]byte{0, 0})
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 1024 {
			t.Skip()
		}
		var row DataRow
		_ = row.Decode(data)
	})
}
