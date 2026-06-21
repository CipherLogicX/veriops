# TLS Certificates

Place your certificate and private key here:
  - trackqa.crt  (full chain)
  - trackqa.key  (private key — never commit)

## Generate self-signed cert for local/lab use only:

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout deployment/nginx/ssl/trackqa.key \
      -out deployment/nginx/ssl/trackqa.crt \
      -subj "/CN=trackqa.local" \
      -addext "subjectAltName=DNS:trackqa.local,IP:127.0.0.1"
    chmod 600 deployment/nginx/ssl/trackqa.key

## Production

Use Let's Encrypt or your corporate CA. Mount at deployment time.
NEVER commit *.key or *.crt files.
