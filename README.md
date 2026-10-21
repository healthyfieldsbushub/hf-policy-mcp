# Healthy Fields SA — Customer Service Policy MCP Server

Cloudflare Worker exposing the Healthy Fields SA customer-service policy, product
catalogue and website knowledge base as MCP tools, so AnyChat's AI Assistants can
check the house rules before replying to a customer.

**Endpoint:** `POST /mcp` (MCP Streamable HTTP, JSON-RPC 2.0). `GET /` returns status.

**Golden rules encoded:** never promise anything (defer with "Can I get back to you?"),
always professional, **no refunds** (management decides to replace the product or
investigate the matter), answering hours 07:00-17:00 SAST with **no outbound outside
those hours** (inbound may still be acknowledged), and WhatsApp contacts (name +
number) belong in the AnyChat phone book.

**Tools (11):**
`get_reply_policy`, `check_send_window`, `classify_request`, `search_products`,
`get_product_price`, `get_business_details`, `normalise_contact`,
`get_contact_intake_rules`, `list_websites`, `search_knowledge`, `get_website_info`.

**Brands covered:** dragonfruitafrica.company, wonderfuldragonfruit.company,
purelyhealthnutra.company, livingculturehealth.company.

`data/` holds the runtime datasets the Worker fetches and edge-caches. Update them
here and the live Worker picks the change up within ~10 minutes — no redeploy.
