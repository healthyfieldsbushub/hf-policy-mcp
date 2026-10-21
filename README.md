# Healthy Fields SA — Customer Service Policy MCP Server

Cloudflare Worker exposing the Healthy Fields SA customer-service policy as MCP tools,
so AnyChat's AI Assistants can check the house rules before replying to a customer.

**Golden rules encoded:** never promise anything (defer with "Can I get back to you?"),
always professional, **no refunds** (management decides to replace or investigate),
answering hours 07:00-17:00 SAST with no outbound outside those hours, and WhatsApp
contacts (name + number) belong in the AnyChat phone book.

**Endpoint:** `POST /mcp` (MCP Streamable HTTP, JSON-RPC 2.0). `GET /` returns status.

**Tools (8):** get_reply_policy, check_send_window, classify_request, search_products,
get_product_price, get_business_details, normalise_contact, get_contact_intake_rules.

Deployed automatically from `worker.js` in this repo. Source of truth lives in the
Hermes workspace at `mcp-servers/hf-policy/` (server.py is the stdio twin).
