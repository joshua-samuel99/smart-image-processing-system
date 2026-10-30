# Smart Image Processing and Enhancement System

A browser-based workspace for inspecting, enhancing, and documenting images. SIPES brings common image adjustments, diagnostic measurements, preliminary forensic screening, and file integrity checks together in one interface.

> **Academic prototype:** forensic indicators are preliminary and do not prove that an image is authentic or manipulated. Results should not be used as the sole basis for important decisions.

## Features

- **Image enhancement:** adjust brightness, contrast, gamma, sharpening, and smoothing; toggle grayscale; compare the original and processed image.
- **Image diagnosis:** view pixel-based brightness, contrast, sharpness, clipping, resolution, and file size measurements.
- **Forensic screening:** generate an ELA-style recompression map, a noise residual view, and copy-move patch candidates.
- **Integrity checks:** calculate SHA-256 fingerprints and inspect a tamper-evident processing history.
- **Reports:** export analysis results as JSON or HTML and review the activity log.
- **Local browser processing:** select an image from your device and use the interface in a modern browser.

## Run the project

No installation or build step is required.

1. Download or clone this repository.
2. Keep `index.html`, `style.css`, and `script.js` together in the same folder.
3. Open `index.html` in a modern web browser.
4. Choose an image, select an operating mode, then click **Analyse and enhance**.

Some browsers may restrict certain browser features when a page is opened directly from disk. If that happens, use a simple local web server or the VS Code **Live Server** extension.

## How to use

1. Choose a PNG, JPEG, or WebP image, or load the demo image.
2. Select **Normal**, **Cautious**, or **Strict** mode.
3. Adjust the image controls and use the comparison slider to inspect the result.
4. Open the **Diagnosis**, **Forensics**, and **Integrity** tabs to review measurements and checks.
5. Export a report from the **Report** tab when needed.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Application layout and interface |
| `style.css` | Visual design and responsive layout |
| `script.js` | Image processing, analysis, integrity checks, and report features |

## Notes and limitations

- The forensic tools identify possible anomalies, not proof of editing. Recompression and natural image texture can create false positives.
- Browser-based processing is an academic prototype and is not equivalent to a specialist Python/OpenCV pipeline.
- A SHA-256 hash identifies file contents. A hash chain can show whether a recorded chain changed, but it cannot establish that the original image is authentic.
- Image processing is performed in the browser; avoid using this prototype as a substitute for professional forensic analysis.

## Built with

HTML, CSS, and JavaScript. The interface uses the DM Sans font from Google Fonts when an internet connection is available; a system font is used as a fallback.

## License

No license has been specified yet. Add a license if you want to state how others may reuse or modify this project.
