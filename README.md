# n8n-nodes-printer

![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

This community node package for n8n provides two nodes for interacting with physical hardware from your workflows:

- **Printer** — Send files to a printer via a [CUPS](https://www.cups.org/) server
- **Scanner** — Scan documents to PDF using a [SANE](http://www.sane-project.org/)-compatible scanner

---

## Installation

### Step 1 — Install the package in n8n

n8n has a built-in way to install community packages:

1. Open your n8n instance and go to **Settings** (bottom-left gear icon)
2. Click **Community Nodes**
3. Click **Install a community node**
4. Enter the package name: `n8n-nodes-printer`
5. Tick the checkbox to confirm you understand community nodes are not verified by n8n
6. Click **Install**

The Printer and Scanner nodes will now appear in the node palette when you search for them.

> **Note:** If your n8n instance doesn't show the Community Nodes option, it may have been disabled by an administrator, or you may be on n8n Cloud's free tier. Self-hosted instances have it enabled by default.

### Step 2 — Install system dependencies

These nodes call command-line tools that must be available in the environment where n8n is running. Which tools you need depends on which nodes you want to use:

| Node | Requires | Package to install |
|---|---|---|
| Printer | `lp` command | `cups-client` |
| Scanner | `scanimage` command | `sane-utils` |

#### If you're running n8n with Docker (most common)

You'll need a custom Dockerfile that installs the required packages. Here's one that covers both nodes:

```Dockerfile
FROM n8nio/n8n

USER root
RUN apk add --no-cache cups-client sane-utils
USER node
```

> **Alpine vs Debian:** The official n8n Docker image is Alpine-based, so use `apk`. If you're using a custom Debian/Ubuntu-based image, use `apt-get install -y cups-client sane-utils` instead.

If you only use the Printer node and not the Scanner (or vice versa), you can install just the package you need.

#### If you're running n8n directly on Linux

Install the packages with your system's package manager. On Debian/Ubuntu:

```bash
sudo apt-get install cups-client sane-utils
```

On Alpine:

```bash
apk add cups-client sane-utils
```

After installing, restart n8n.

---

## Printer Node

### What you need

A CUPS print server running somewhere on your network and reachable from the machine running n8n. CUPS runs on Linux and macOS and manages one or more printers.

### Usage

1. **CUPS Server IP** — The IP address of your CUPS server (e.g., `192.168.1.100`)
2. **Select Printer** — Click the field to auto-discover printers on your server, or type the queue name manually
3. **Binary Property** — The name of the binary field in the incoming data that holds the file to print (usually `data`)
4. **Options** (all optional):
   - **Quantity** — Number of copies
   - **Page Range** — Which pages to print, e.g. `1-5, 8`
   - **Advanced CUPS Options** — A JSON object of extra CUPS flags for full control (see below)

### Advanced CUPS Options example

To print A4, landscape, double-sided:

```json
{
  "media": "A4",
  "orientation-requested": "4",
  "sides": "two-sided-long-edge"
}
```

### Troubleshooting: 'The printer or class does not exist'

This usually means the CUPS client can't resolve the printer's hostname. Fix it by telling the client the server's IP address directly. Add this to your Dockerfile:

```Dockerfile
RUN echo "ServerName 192.168.1.100" >> /etc/cups/client.conf
```

Replace `192.168.1.100` with your actual CUPS server IP.

---

## Scanner Node

### What you need

A scanner supported by [SANE](http://www.sane-project.org/) (Scanner Access Now Easy) and accessible from the machine running n8n — either via USB or over the network. Many Canon, Epson, HP, and Brother multifunction printers work out of the box with SANE.

To check if your scanner is supported, look it up in the [SANE device list](http://www.sane-project.org/sane-supported-devices.html).

### Usage

1. **Scanner Device** — Click the field to auto-discover scanners, or type the device name manually (e.g., `pixma:MX920_192.168.1.5` or `bjnp://192.168.1.5`)
2. **Output Binary Property** — The name to give the scanned PDF in the output data (default: `data`). Downstream nodes can read the PDF from this field.
3. **Options** (all optional):
   - **Resolution** — Scan quality in DPI. 150 is fine for reading text, 300 is good general-purpose quality, 600 is high quality (and a much larger file). Default: 300.
   - **Scan Mode** — `Color`, `Gray` (greyscale), or `Lineart` (black and white only). Default: Color.
   - **Source** — `Flatbed` (place the page on the glass) or `ADF` (Automatic Document Feeder, for scanning a stack of pages). Default: Flatbed.

The node outputs the scanned document as a PDF binary. You can then pass it to other nodes — for example, save it to disk, upload it to cloud storage, or send it by email.

### Finding your scanner's device name

If auto-discovery doesn't work (e.g., n8n is running in Docker and can't see the scanner directly), you can find the device name by running this on the host machine where the scanner is connected:

```bash
scanimage -L
```

This will print something like:

```
device `pixma:MX920_192.168.1.5' is a CANON Canon PIXMA MX920 multi-function peripheral
```

The part between the backtick and the single quote — `pixma:MX920_192.168.1.5` — is what you paste into the **Scanner Device** field using the manual **Name** mode.

### Scanning over the network from Docker

If your scanner is attached to a different machine on your network (e.g., a Raspberry Pi running `saned`), you can point SANE at it by setting the `SANE_NET_HOSTS` environment variable when starting your n8n container:

```bash
docker run -e SANE_NET_HOSTS=192.168.1.50 ... n8nio/n8n
```

Then use `net:192.168.1.50:pixma:MX920_...` as the device name, or let auto-discovery find it.

---

## License

[MIT](https://github.com/n8n-io/n8n-nodes-starter/blob/master/LICENSE.md)
