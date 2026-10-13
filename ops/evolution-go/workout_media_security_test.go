// Copy into Evolution's pkg/sendMessage/service when validating dependency updates.
package send_service

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chai2010/webp"
	imagewebp "golang.org/x/image/webp"
)

func TestWorkoutWebPConversionAfterDependencyUpdate(t *testing.T) {
	src := encodePNG(t, 80, 40)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(src)
	}))
	defer server.Close()
	encoded, err := convertToWebP(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	for name, decode := range map[string]func() (int, int, error){
		"cgo": func() (int, int, error) {
			img, err := webp.Decode(bytes.NewReader(encoded))
			if err != nil {
				return 0, 0, err
			}
			return img.Bounds().Dx(), img.Bounds().Dy(), nil
		},
		"pure-go": func() (int, int, error) {
			img, err := imagewebp.Decode(bytes.NewReader(encoded))
			if err != nil {
				return 0, 0, err
			}
			return img.Bounds().Dx(), img.Bounds().Dy(), nil
		},
	} {
		t.Run(name, func(t *testing.T) {
			width, height, err := decode()
			if err != nil {
				t.Fatal(err)
			}
			if width != 80 || height != 40 {
				t.Fatalf("unexpected dimensions: %dx%d", width, height)
			}
		})
	}
}
