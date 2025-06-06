# Grafana PDF Exporter

This project allows exporting Grafana dashboards to PDF using Puppeteer. The project uses a Node.js server to handle HTTP requests and launch Puppeteer to generate the PDFs.

It is possible to inject a button into Grafana to generate a PDF directly from the interface.

![Button displayed in Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/injected-button-in-grafana.png)

## Prerequisites

- Docker
- Docker Compose

## Installation

Clone this repository and navigate to the project directory:

```shell
git clone https://github.com/arthur-mdn/ExportGrafanaDashboardToPDF.git
cd ExportGrafanaDashboardToPDF
```

## Configuration

### Environment Variables
Duplicate the `.env.example` file and rename it to `.env`. 

```shell
cp .env.template .env
nano .env
```

Modify the values according to your configuration.

```dotenv
GRAFANA_USER=gfexp
GRAFANA_PASSWORD=gfexp
```

`GRAFANA_USER` and `GRAFANA_PASSWORD` are the credentials used to authenticate to the Grafana instance.

## Usage
To start the project, run the following command:

```shell
docker compose up -d --build
```
The server will be accessible on port 3001.

### Generating a PDF
To generate a PDF, send a POST request to the /generate-pdf API with the Grafana dashboard URL as a parameter.
The server will respond with the URL of the generated PDF.

#### Using cURL
```bash
curl \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "url": "http://your-grafana-server/d/your-dashboard-id"}' \
  http://localhost:3001/generate-pdf
```

#### Using the `generate-pdf.sh` shell script
```bash
docker exec -it grafana-export-to-pdf /usr/src/app/generate-pdf.sh GF_DASH_URL 'http://your-grafana-server/d/your-dashboard-id'
```

#### Using an HTML button injected into Grafana
> You must ensure that the ``disable_sanitize_html`` parameter is set to ``true`` in the Grafana configuration file to be able to inject HTML and Javascript code.
>
> ![Disable Sanitize HTML in Grafana Settings](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/grafana-disable-sanitize-html.png)

To inject a button directly into Grafana, add the content of the `grafana-button.html` file to the "Text" field of a Grafana text panel.

![How to inject the button in Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/inject-button-in-grafana.png)

Make sure to modify the server URL if necessary. 
```javascript
window.gfexpPdfGenerationServerUrl = 'http://localhost:3001';
```

The button should now be displayed in the native Grafana share menu.

You can easily deactivate the button injection by commenting the HTML marker
```html
<!-- <div id="GFEXP_marker"> -->
  <!-- This is a marker to enable HTML injection in this panel -->
<!-- </div> -->
```

### Generating a PDF with a time range

> In the examples below, the time range is ``now-1y/y``, which corresponds to last year.

> See more details on supported time ranges in the [Grafana documentation](https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/#time-units-and-relative-ranges).

To generate a PDF with a time range, you can simply add the native Grafana time range parameters to the URL.

```shell
http://your-grafana-server/d/your-dashboard-id?from=now-1y%2Fy&to=now-1y%2Fy
```

But you can also specify the time range manually by specifying the `from` and `to` parameters in the request.

#### Using cURL
```bash
curl \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "url": "http://your-grafana-server/d/your-dashboard-id", "from": "now-1y/y", "to": "now-1y/y"}' \
  http://localhost:3001/generate-pdf
```

#### Using the `generate-pdf.sh` shell script
```bash
docker exec -it grafana-export-to-pdf /usr/src/app/generate-pdf.sh GF_DASH_URL 'http://your-grafana-server/d/your-dashboard-id' GF_FROM 'now-1y/y' GF_TO 'now-1y/y'
```

#### Using the HTML button injected into Grafana
The injected HTML button already retrieves the values of the selected time range in Grafana. You do not need to specify them manually. It also retrieves the theme selected.

![Export Panel Values](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/export-modal-values.png)

### Generating a PDF with a fixed width and height
To generate a PDF with a fixed width and height, you can adjust the `PDF_WIDTH_PX` and `PDF_HEIGHT_PX` variables in the `.env` file.
```dotenv
PDF_WIDTH_PX=1920
PDF_HEIGHT_PX=1080
```

> If you want the PDF to be generated with the same height as the Grafana dashboard, you can set the height variable to `auto`:
> ```dotenv
> PDF_HEIGHT_PX=auto
> ```

But you can also specify the width and height manually by specifying the `pdfWidthPx` and `pdfHeightPx` parameters in the request.
> Using the `pdfWidthPx` and `pdfHeightPx` parameters will override the values set in the `.env` file.
#### Using cURL
```bash
curl \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "url": "http://your-grafana-server/d/your-dashboard-id", "pdfWidthPx": 1920, "pdfHeightPx": 1080}' \
  http://localhost:3001/generate-pdf
```
#### Using the `generate-pdf.sh` shell script
```bash
docker exec -it grafana-export-to-pdf /usr/src/app/generate-pdf.sh GF_DASH_URL 'http://your-grafana-server/d/your-dashboard-id' GF_PDF_WIDTH_PX 1920 GF_PDF_HEIGHT_PX 1080
```

### Generating a PDF with only a specific panel

By default, the server exports the entire dashboard. If you want to export a single panel, you can add the `viewPanel` parameter to the URL.

```shell
http://your-grafana-server/d/your-dashboard-id?viewPanel=2
```

> The script will try to extract the panel title and use it in the PDF filename.

## Custom Configuration

### Fetch the dashboard name and the time range from HTML elements to be used in the PDF filename

To avoid fetching the dashboard name and the time range from the URL (that are sometimes not user-friendly), you can extract the values directly from HTML elements in the Grafana dashboard with a better display format.

#### Example
For this URL: `http://localhost/d/ID/stats?from=now-1y%2Fy&to=now-1y%2Fy`
- The initial PDF filename will be: `stats_now-1y_y_to_now-1y_y.pdf`
- With the custom configuration, the PDF filename could be: `Stats_Sunday_January_1_2023_-_Sunday_December_31_2023.pdf`

#### Activation

To activate this feature, set the following variable to `true` in your `.env` file:
```dotenv
EXTRACT_DATE_AND_DASHBOARD_NAME_FROM_HTML_PANEL_ELEMENTS=true
```

And then add the following code to the Grafana panel where you want to display the dashboard name and the time range. You can customize the display format by modifying the `formatTimestamp` function in the script below:

```html

<div style="display:flex; align-items:center;justify-content:space-between;">
  <p id="gfexp_display_actual_dashboard_title" style="margin: 0;line-height: 1rem;">${__dashboard}</p>
  <p id="gfexp_display_actual_date" style="margin: 0;line-height: 1rem;text-transform:capitalize;"></p>
</div>

<script>
    (function() {
        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString( window.gfexpLang === 'fr' ? 'fr-FR' : 'en-US', options);
        }

        let fromTimestampGrafana = ${__from};
        let toTimestampGrafana = ${__to};

        document.getElementById("gfexp_display_actual_date").innerHTML = formatTimestamp(fromTimestampGrafana) + " - " + formatTimestamp(toTimestampGrafana);
    })();
</script>
```

### Force Kiosk Mode
By default, `FORCE_KIOSK_MODE` is set to `true`. This means that if the url does not contain the `kiosk` parameter, the server will add it to the URL to ensure that the PDF is generated without any elements overlapping the dashboard content . 

#### Deactivation
You can disable this behavior by setting the following variable to `false` in your `.env` file:
    
```dotenv
FORCE_KIOSK_MODE=false
```

> Disabling this feature would have no effect if the `kiosk` parameter is already present in the URL given to the server.

### Debug Mode
By default, `DEBUG_MODE` is set to `false`. When activated, the server will save the HTML content of the page to a file in the `debug` folder. 
There is also more verbose logging in the console, which can help you understand what is happening during the PDF generation process.
This can be useful for debugging purposes. 

#### Activation
You can enable this behavior by setting the following variable to `true` in your `.env` file:
    
```dotenv
DEBUG_MODE=true
```
### Hide Dashboard Controls
By default, `HIDE_DASHBOARD_CONTROLS` is set to `true`. This means that the server will hide the dashboard controls (such as the time range selector, the share button, etc.) when generating the PDF. This can be useful to have a cleaner PDF output.

### Expand Collapsed Panels
By default, `EXPAND_COLLAPSED_PANELS` is set to `true`. This means that the server will expand all collapsed panels when generating the PDF. This can be useful to ensure that all panels are visible in the PDF output.

### Check for all queries to be completed

> ⚠️ Experimental feature! 
> 
> Intended as a future replacement for `NAVIGATION_TIMEOUT`.

When activated, the server will wait for all queries to be completed before generating the PDF. This can be useful for dashboards with long queries.

#### Activation

You can enable this behavior by setting the following variable to `true` in your `.env` file.

```dotenv
CHECK_QUERIES_TO_COMPLETE=true
```

You can also set the maximum time to wait for each single query to be completed, the interval between each check for the queries completion, and the maximum time to wait for all the queries to be completed, before generating the PDF.

```dotenv
CHECK_QUERIES_TO_COMPLETE_MAX_QUERY_COMPLETION_TIME=30000
CHECK_QUERIES_TO_COMPLETE_QUERIES_INTERVAL=1000
CHECK_QUERIES_TO_COMPLETE_QUERIES_COMPLETION_TIMEOUT=60000
```

### Expand Table Panels
> Only available in Grafana v11.4+
By default, `EXPAND_TABLE_PANELS` is set to `false` due to performance concerns. When enabled, the server will try to auto-adjust the height of table panels to fit all the rows when generating the PDF. This can be useful to ensure that all data is visible in the PDF output.

You can enable this feature via your .env file:

```dotenv
EXPAND_COLLAPSED_TABLES=true
```
> ⚠️ **Important Note:** When large tables are expanded, the generated PDF height can grow dramatically (several thousand pixels), which may:
> - Slow down rendering or cause performance issues during export
> - Produce unexpectedly long PDFs
>
> **Recommendation:** Only enable table expansion for dashboards where full row visibility is critical, or consider adjusting panel sizes manually in Grafana to fit content naturally.

## Known Issues

### With injected button in Grafana

- The PDF generation is complete but the browser do not allow to open the popup window.
  - You can manually allow the popup window by clicking on the popup blocked icon in the browser's address bar, and then click on "Always allow pop-ups from ...".

    ![Allow pop-ups](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/browser-popups-blocked.png)

## Author

- [Arthur Mondon](https://mondon.pro)

### Contributing

- [svet-b](https://gist.github.com/svet-b/1ad0656cd3ce0e1a633e16eb20f66425)
- [NerdySoftPaw](https://github.com/NerdySoftPaw)
- [christos-diamantis](https://github.com/christos-diamantis)
