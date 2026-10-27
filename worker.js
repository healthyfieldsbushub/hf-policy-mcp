--86040ab26193a113d6dec4ea642e6b2f2f234ddcfa018d947a2d188a4074
Content-Disposition: form-data; name="worker.js"

/**
 * Healthy Fields SA — Customer Service Policy MCP Server (Cloudflare Worker)
 * ==========================================================================
 *
 * AnyChat's AI Assistants connect OUT to MCP servers (AnyChat v1.8.56+,
 * Settings -> MCP servers). This Worker is the publicly reachable endpoint
 * they connect to. It is a POLICY + LOOKUP server: it never sends messages.
 * AnyChat owns the conversation; this server makes sure whatever AnyChat's AI
 * says complies with management's golden rules.
 *
 * Golden rules encoded here:
 *   1. Never promise anything — defer with "Can I get back to you?"
 *   2. Always professional.
 *   3. No refunds. Management decides: replace the product, or investigate.
 *      The business does not accept responsibility for client mistakes.
 *   4. Answering hours: SAST 07:00-17:00. Inbound may be acknowledged any time;
 *      outbound is NEVER initiated outside those hours.
 *   5. WhatsApp contacts (name + number) go into the AnyChat phone book.
 *
 * Transport: MCP Streamable HTTP (JSON-RPC 2.0) at POST /mcp
 *   Also serves GET / and GET /health for a quick human check.
 *
 * Deploy:
 *   npx wrangler deploy           (after `npx wrangler login`)
 *   or paste into the Cloudflare dashboard's Workers editor.
 *
 * CATALOGUE is injected at build time by build_worker.py.
 */

const BUSINESS = {
  legal_name: "Healthy Fields ProAgriSA",
  display_name: "Healthy Fields SA",
  tagline:
    "Dragon Fruit Farming \u2022 Agricultural Youth Development \u2022 Gut Health & Biological Solutions",
  address: "Franschhoek Estate, 22 Wren St, Rant en Dal, Krugersdorp, 1739, South Africa",
  email: ["admin@proagrisa.co.za", "orders@proagrisa.co.za"],
  phone: ["+27 83 447 4639", "+1 351 777 2848"],
  whatsapp: ["+1 555-913-5536", "+27 84 715 8514"],
  bank: "Capitec Business Bank",
  account_name: "Healthy Fields",
  account_number: "1052 3916 30",
  branch_code: "450105",
  payment_days: 14,
  late_fee: "5% per month",
  vat: "Not VAT registered \u2014 no VAT is charged.",
  currency: "ZAR",
};

const OPEN_HOUR = 7;
const CLOSE_HOUR = 17;

/* ------------------------------------------------------------------ helpers */

/** Current time in South African Standard Time (UTC+2). */
function sastNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    "-" + p(d.getUTCMonth() + 1) +
    "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) +
    ":" + p(d.getUTCMinutes())
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function findProducts(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const all = catalogue();
  const exact = all.filter((p) => (p.sku || "").toLowerCase() === q);
  if (exact.length) return exact;
  return all
    .filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
    )
    .slice(0, 25);
}

function normaliseContact(rawName, rawNumber) {
  let name = String(rawName || "").replace(/\s+/g, " ").trim();
  name = name.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "");
  const junk = ["you", "me", "unknown", "whatsapp", "business account", "no name"];
  if (junk.includes(name.toLowerCase())) name = "";

  let digits = String(rawNumber || "").replace(/[^\d+]/g, "");
  if (digits && !digits.startsWith("+")) {
    if (digits.startsWith("0") && digits.length === 10) digits = "+27" + digits.slice(1);
    else if (digits.startsWith("27") && digits.length === 11) digits = "+" + digits;
    else digits = "+" + digits;
  }
  return {
    name: name || "(name not provided \u2014 ask the customer)",
    name_was_missing: !name,
    phone: digits,
    country_code: digits.length > 2 ? digits.slice(1, 3) : "",
    note:
      "Add to the AnyChat phone book via anychat_create_contact. If the name is missing, " +
      "ask the customer how they would like to be addressed.",
  };
}

const DRAFTS = {
  refund:
    "Thank you for getting in touch, and I'm sorry to hear this. I'm not able to approve " +
    "anything myself \u2014 I'll pass this to management, who will look into the matter and " +
    "decide how best to resolve it. Can I get back to you?",
  complaint:
    "Thank you for letting us know, and I'm sorry for the trouble. I'd like to have this " +
    "looked into properly. Can I get back to you once management has reviewed it?",
  delivery: "Thank you for your message. Let me check on that for you \u2014 can I get back to you?",
  pricing:
    "Thank you for your interest. I'll confirm the current pricing for you \u2014 can I get " +
    "back to you with the details?",
  payment:
    "Thank you for your message. I'm not able to confirm payments myself \u2014 that is " +
    "verified by our team. Can I get back to you once it has been checked?",
  product_info:
    "Thank you for your question. Let me put the correct information together for you \u2014 " +
    "can I get back to you?",
  order: "Thank you for your interest. Let me check availability for you \u2014 can I get back to you?",
  general: "Thank you for your message. Let me look into it and come back to you.",
};

const CLASSES = [
  ["refund", ["refund", "money back", "reimburse", "credit me", "return my money", "cancel and pay"]],
  ["complaint", ["dead", "died", "damaged", "broken", "rotten", "disappointed", "terrible", "not happy", "poor quality", "wrong item"]],
  ["delivery", ["delivery", "deliver", "courier", "shipping", "arrive", "tracking", "when will"]],
  ["pricing", ["price", "cost", "how much", "quote", "quotation", "discount", "bulk", "wholesale"]],
  ["payment", ["paid", "payment", "eft", "proof of payment", "invoice", "banking"]],
  ["product_info", ["how do i", "how to", "grow", "plant", "care", "fertil", "spirulina", "cultivar", "variety"]],
  ["order", ["order", "buy", "purchase", "available", "stock", "in stock"]],
];

/* -------------------------------------------------------------------- tools */

const TOOLS = [
  {
    name: "get_reply_policy",
    description:
      "Return the full customer-service policy. Call this before composing any reply to a " +
      "customer, so the answer complies with management's rules.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () =>
      JSON.stringify(
        {
          golden_rules: [
            "NEVER promise anything. If you cannot answer immediately or the request needs a " +
              "decision, say: 'Can I get back to you on that?' Do not commit to dates, prices, " +
              "discounts, stock, delivery times or outcomes.",
            "Always be professional, courteous and concise. No slang, no emojis unless the " +
              "customer used them first, no arguing.",
            "NO REFUNDS. Never offer, imply or discuss a refund as an option. If a customer asks " +
              "for a refund, say the matter must be looked into by management, and that management " +
              "will decide whether to replace the product or investigate the matter further. The " +
              "business cannot take responsibility for mistakes made by the customer or by other parties.",
            "Answering hours are South African time (SAST), 07:00-17:00.",
            "Never give banking details other than the approved ones below, and never confirm a " +
              "payment as received \u2014 that is verified by a human.",
            "ALL visits, consultations and collections MUST be booked in advance through the " +
              "website with a date selection. NO site visits, NO drop-ins and NO stop-buys are " +
              "allowed on the estate \u2014 we are often on the farm or on the road. This rule has " +
              "stood for 14 years and still applies.",
            "Fees: R80 collection fee is payable when booking online; R250 consultation fee is " +
              "payable when booking. These two are normally different customers \u2014 a " +
              "consultation is R250 without the R80 collection fee.",
            "Orders must be PAID IN FULL before collection. Plant material is shipped from the " +
              "farm to the office to be packed for the customer.",
            "Local shipping inside South Africa via The Courier Guy: 1 to 25 plants = R99.",
          ],
          answering_hours: {
            timezone: "Africa/Johannesburg (SAST, UTC+2)",
            open: "07:00",
            close: "17:00",
            inbound:
              "Messages that arrive after hours may still be acknowledged, because the customer " +
              "contacted us.",
            outbound: "We NEVER initiate outbound messages outside 07:00-17:00 SAST.",
          },
          refund_policy: {
            refunds: "Not offered.",
            process:
              "Any refund request is escalated to management. Management decides either to " +
              "REPLACE the product or to LOOK INTO THE MATTER.",
            responsibility:
              "The business does not accept responsibility for mistakes made by the customer or " +
              "by third parties.",
            suggested_wording: DRAFTS.refund,
          },
          visits_and_fees: {
            address: "Franschhoek Estate, 22 Wren St, Rant en Dal, Krugersdorp, 1739, South Africa",
            booking_required: true,
            booking_channel: "Website, with date selection",
            no_drop_ins: "NO site visits, NO drop-ins, NO stop-buys. Arrange beforehand.",
            collection_fee_zar: 80,
            collection_fee_note: "Payable when booking online. Charged so a booked appointment is not wasted.",
            consultation_fee_zar: 250,
            consultation_note: "Payable when booking. Separate from the R80 collection fee.",
            payment_before_collection: true,
            payment_note: "Orders must be paid in full before collection; plant material is shipped from the farm to the office to be packed.",
            shipping: {
              local_courier: "The Courier Guy",
              local_1_to_25_plants_zar: 99,
              note: "Local South African shipping only. Quoted ex-nursery, excluding delivery and transit insurance.",
            },
            rule_age: "This booking rule has applied for 14 years and still stands.",
          },
          escalate_when: [
            "refund or compensation requested",
            "product quality or delivery complaint",
            "bulk / commercial pricing requested",
            "anything involving money already paid",
            "legal, medical or regulatory questions",
          ],
          business: BUSINESS,
        },
        null,
        1
      ),
  },
  {
    name: "check_send_window",
    description:
      "Check whether we may send a message right now, in South African time. Optionally pass an " +
      "ISO timestamp to test another moment.",
    inputSchema: {
      type: "object",
      properties: { when: { type: "string", description: "Optional ISO timestamp" } },
      additionalProperties: false,
    },
    run: ({ when }) => {
      let d;
      if (when) {
        const parsed = new Date(when);
        if (isNaN(parsed.getTime())) return JSON.stringify({ error: "unparseable timestamp: " + when });
        d = new Date(parsed.getTime() + 2 * 60 * 60 * 1000);
      } else {
        d = sastNow();
      }
      const h = d.getUTCHours();
      const open = h >= OPEN_HOUR && h < CLOSE_HOUR;
      let nxt;
      if (open) nxt = d;
      else if (h >= CLOSE_HOUR) nxt = new Date(d.getTime() + (24 - h + OPEN_HOUR) * 3600 * 1000);
      else nxt = new Date(d.getTime() + (OPEN_HOUR - h) * 3600 * 1000);
      nxt = new Date(Date.UTC(nxt.getUTCFullYear(), nxt.getUTCMonth(), nxt.getUTCDate(), OPEN_HOUR, 0, 0));

      return JSON.stringify(
        {
          now_sast: fmt(d),
          day: DAYS[d.getUTCDay()],
          within_hours: open,
          may_send_outbound: open,
          may_acknowledge_inbound: true,
          next_outbound_window: fmt(nxt) + " SAST",
          guidance: open
            ? "Inside 07:00-17:00 SAST: normal replies are fine."
            : "Outside 07:00-17:00 SAST. You may acknowledge a message the customer sent in, but " +
              "do NOT initiate any new outbound message. Queue anything else for " +
              nxt.toISOString().slice(11, 16) +
              " SAST.",
        },
        null,
        1
      );
    },
  },
  {
    name: "classify_request",
    description:
      "Classify an incoming customer message so the right policy is applied. Returns the " +
      "category, whether it needs escalation, and a policy-compliant draft reply that never " +
      "promises anything.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string", description: "The customer's message" } },
      required: ["message"],
      additionalProperties: false,
    },
    run: ({ message }) => {
      const m = String(message || "").toLowerCase();
      let category = "general";
      for (const [cat, keys] of CLASSES) {
        if (keys.some((k) => m.includes(k))) {
          category = cat;
          break;
        }
      }
      const escalate = ["refund", "complaint", "payment"].includes(category);
      return JSON.stringify(
        {
          category,
          needs_escalation: escalate,
          escalate_to: escalate ? "management" : null,
          draft_reply: DRAFTS[category],
          reminders: [
            "Do not promise dates, prices, stock or outcomes.",
            "Do not offer a refund under any circumstance.",
            "Check check_send_window before sending anything.",
          ],
        },
        null,
        1
      );
    },
  },
  {
    name: "search_products",
    description:
      "Search the Healthy Fields product catalogue by name or SKU (e.g. 'ruby', 'spirulina', " +
      "'DF-SWC-1000'). Returns name, SKU and price in ZAR.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    run: ({ query }) => {
      const hits = findProducts(query);
      if (!hits.length) return JSON.stringify({ query, found: 0, note: "No matching product." });
      return JSON.stringify(
        {
          query,
          found: hits.length,
          currency: "ZAR",
          products: hits.map((p) => ({ name: p.name, sku: p.sku, price: p.price, sale_price: p.sale_price })),
          note:
            "Prices are indicative. Never confirm a price as final \u2014 defer to management with " +
            "'Can I get back to you?'.",
        },
        null,
        1
      );
    },
  },
  {
    name: "get_product_price",
    description: "Get the exact price for one SKU from the catalogue.",
    inputSchema: {
      type: "object",
      properties: { sku: { type: "string" } },
      required: ["sku"],
      additionalProperties: false,
    },
    run: ({ sku }) => {
      const hits = findProducts(sku);
      if (!hits.length) return JSON.stringify({ sku, found: false });
      const p = hits[0];
      return JSON.stringify(
        {
          sku: p.sku,
          name: p.name,
          price_zar: p.price,
          sale_price_zar: p.sale_price,
          note: "Indicative only \u2014 do not confirm as final. Defer to management.",
        },
        null,
        1
      );
    },
  },
  {
    name: "get_business_details",
    description: "Approved company contact and banking details for customer replies.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => JSON.stringify(BUSINESS, null, 1),
  },
  {
    name: "normalise_contact",
    description:
      "Clean a WhatsApp display name and number into phone-book-ready fields. WhatsApp messages " +
      "normally arrive with the client's display name and their number.",
    inputSchema: {
      type: "object",
      properties: {
        raw_name: { type: "string" },
        raw_number: { type: "string" },
      },
      required: ["raw_name", "raw_number"],
      additionalProperties: false,
    },
    run: ({ raw_name, raw_number }) => JSON.stringify(normaliseContact(raw_name, raw_number), null, 1),
  },
  {
    name: "get_contact_intake_rules",
    description: "Rules for adding WhatsApp contacts to the AnyChat phone book.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () =>
      JSON.stringify(
        {
          source: "Incoming WhatsApp conversations carry the client's display name and number.",
          required: ["name", "phone (international format, e.g. +27821234567)"],
          steps: [
            "Call normalise_contact with the WhatsApp display name and number.",
            "Call anychat_search_contact by phone/email first to avoid duplicates.",
            "If absent, call anychat_create_contact with the cleaned name and phone.",
          ],
          rules: [
            "Never overwrite an existing contact's name without checking.",
            "Do not store extra personal data beyond name, phone, email, town and country.",
            "If the display name looks like a business or a status rather than a person, leave the " +
              "name blank and ask the customer how they would like to be addressed.",
          ],
        },
        null,
        1
      ),
  },
];

/* ------------------------------------------------------- knowledge base tools */

/**
 * Data loading
 * -------------
 * The catalogue and the website knowledge base are large (~160 KB together),
 * which is awkward to push through the deploy channel. Instead they live in a
 * GitHub repo and are fetched at runtime by the Worker, then held in the
 * Cloudflare edge cache. The Worker itself stays small.
 *
 * DATA_BASE can be overridden with a Worker var; defaults to the public repo.
 * If a fetch fails, the tools degrade gracefully rather than throwing.
 */
const DATA_BASE =
  (typeof DATA_BASE_URL !== "undefined" && DATA_BASE_URL) ||
  "https://raw.githubusercontent.com/healthyfieldsbushub/hf-policy-mcp/main/data";

let _cache = { catalogue: null, knowledge: null };

async function loadData(name) {
  if (_cache[name]) return _cache[name];
  const url = `${DATA_BASE}/${name}.json`;
  try {
    const res = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!res.ok) return null;
    const data = await res.json();
    _cache[name] = data;
    return data;
  } catch {
    return null;
  }
}

function catalogue() {
  if (_cache.catalogue) return _cache.catalogue;
  return typeof CATALOGUE !== "undefined" ? CATALOGUE : [];
}

function kbSites() {
  if (_cache.knowledge) return _cache.knowledge;
  return typeof KNOWLEDGE !== "undefined" && Array.isArray(KNOWLEDGE) ? KNOWLEDGE : [];
}

/** Warm both datasets. Called at the start of a request when needed. */
async function warm() {
  await Promise.all([loadData("catalogue"), loadData("knowledge")]);
}

function kbSearch(query, limit) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return [];

  const hits = [];
  for (const site of kbSites()) {
    for (const page of site.pages || []) {
      const hay = (page.title + "\n" + page.text).toLowerCase();
      let score = 0;
      for (const t of terms) {
        const n = hay.split(t).length - 1;
        if (n) score += n;
      }
      if (!score) continue;
      // build a snippet around the first matching term
      const first = terms.find((t) => hay.includes(t));
      const idx = first ? hay.indexOf(first) : 0;
      const start = Math.max(0, idx - 220);
      const snippet = page.text.slice(start, start + 620).replace(/\s+/g, " ").trim();
      hits.push({
        score,
        site: site.host,
        url: page.url,
        title: page.title,
        snippet,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit || 6);
}

TOOLS.push(
  {
    name: "list_websites",
    description:
      "List the Healthy Fields group websites covered by this knowledge base, with what " +
      "each one sells. Use this to work out which brand a customer is talking about.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () =>
      JSON.stringify(
        {
          websites: kbSites().map((s) => ({
            host: s.host,
            url: s.url,
            title: s.title,
            pages_indexed: (s.pages || []).length,
          })),
          note:
            "All four brands are part of the same group and share the same service rules: " +
            "never promise anything, no refunds, outbound only 07:00-17:00 SAST.",
        },
        null,
        1
      ),
  },
  {
    name: "search_knowledge",
    description:
      "Search the four Healthy Fields websites (products, shipping, payment, policies, " +
      "about pages) for an answer to a customer question. Returns matching passages with " +
      "their source URL. Always cite the source URL in your reply.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the customer is asking about" },
        limit: { type: "number", description: "Max results (default 6)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: ({ query, limit }) => {
      const hits = kbSearch(query, limit);
      if (!hits.length) {
        return JSON.stringify({
          query,
          found: 0,
          guidance:
            "Nothing in the knowledge base covers this. Do NOT invent an answer. Reply that " +
            "you will check and come back to them: 'Can I get back to you on that?'",
        });
      }
      return JSON.stringify(
        {
          query,
          found: hits.length,
          results: hits,
          guidance:
            "Use these passages to answer, but do not quote prices or lead times as final. " +
            "Cite the source URL. If the passages do not clearly answer the question, defer " +
            "with 'Can I get back to you?'.",
        },
        null,
        1
      );
    },
  },
  {
    name: "get_website_info",
    description:
      "Get the indexed summary and page list for one of the group websites. Pass a host or " +
      "a keyword such as 'dragonfruit', 'purelyhealth' or 'livingculture'.",
    inputSchema: {
      type: "object",
      properties: { site: { type: "string", description: "Host or keyword" } },
      required: ["site"],
      additionalProperties: false,
    },
    run: ({ site }) => {
      const q = String(site || "").toLowerCase();
      const match = kbSites().find((s) => s.host.includes(q) || s.url.toLowerCase().includes(q));
      if (!match) {
        return JSON.stringify({
          site,
          found: false,
          available: kbSites().map((s) => s.host),
        });
      }
      const first = (match.pages || [])[0];
      return JSON.stringify(
        {
          site: match.host,
          url: match.url,
          title: match.title,
          summary: first ? first.text.slice(0, 1200).replace(/\s+/g, " ") : "",
          pages: (match.pages || []).map((p) => ({ url: p.url, title: p.title })),
        },
        null,
        1
      );
    },
  }
);

const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/* ---------------------------------------------------------------- JSON-RPC */

const PROTOCOL_FALLBACK = "2025-06-18";

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handle(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_FALLBACK,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "healthyfields-service-policy", version: "1.0.0" },
        instructions:
          "Customer-service policy, product catalogue and website knowledge base for Healthy " +
          "Fields SA and its group brands (Dragon Fruit Africa, Wonderful Dragon Fruit, Purely " +
          "Health Nutra, Living Culture Health). Call get_reply_policy before composing any " +
          "customer reply. Use search_knowledge to answer product and shipping questions and " +
          "cite the source URL. Never promise anything \u2014 defer with 'Can I get back to you?'. " +
          "No refunds. Outbound messages only between 07:00 and 17:00 South African time.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications get no reply

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const tool = TOOL_MAP[name];
      if (!tool) return rpcError(id, -32602, "Unknown tool: " + name);
      try {
        const text = tool.run(args);
        return rpcResult(id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: "text", text: "Tool error: " + (e && e.message ? e.message : String(e)) }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, -32601, "Method not found: " + method);
  }
}

/* ------------------------------------------------------------------ routing */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/" || url.pathname === "/health") {
      await warm();
      const now = sastNow();
      const open = now.getUTCHours() >= OPEN_HOUR && now.getUTCHours() < CLOSE_HOUR;
      return json({
        server: "healthyfields-service-policy",
        status: "ok",
        tools: TOOLS.length,
        mcp_endpoint: url.origin + "/mcp",
        now_sast: fmt(now),
        within_business_hours: open,
        catalogue_products: catalogue().length,
        websites_indexed: kbSites().map((s) => ({
          host: s.host,
          brand: s.brand,
          pages: (s.pages || []).length,
        })),
        knowledge_pages: kbSites().reduce((n, s) => n + (s.pages || []).length, 0),
        data_source: DATA_BASE,
      });
    }

    if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);

    if (request.method === "GET") {
      // Streamable HTTP clients may probe with GET; tell them to POST.
      return new Response("Use POST for MCP JSON-RPC. See / for status.", {
        status: 405,
        headers: { ...CORS, Allow: "POST, OPTIONS" },
      });
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }

    // Tool calls need the catalogue + knowledge base; pull them in first.
    // (Cheap after the first request: held in the isolate and edge cache.)
    const needsData =
      (Array.isArray(body) ? body : [body]).some((m) => m && m.method === "tools/call");
    if (needsData) await warm();

    // Batch support
    if (Array.isArray(body)) {
      const out = body.map(handle).filter((r) => r !== null);
      if (!out.length) return new Response(null, { status: 202, headers: CORS });
      return json(out);
    }

    const res = handle(body);
    if (res === null) return new Response(null, { status: 202, headers: CORS });
    return json(res);
  },
};

--86040ab26193a113d6dec4ea642e6b2f2f234ddcfa018d947a2d188a4074--
