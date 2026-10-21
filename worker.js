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
  address: "22 Wren Street, Rant and Dal, Chancliff, Krugersdorp",
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

/* Injected at build time by build_worker.py — do not edit by hand. */
const CATALOGUE = [{"name":"Widget A","sku":"001","price":10.0,"sale_price":null},{"name":"Cheesecloth - 100% Cotton","sku":"ACC-CHEESECLOTH","price":69.0,"sale_price":null},{"name":"Nut Milk Bag - Organic Cotton","sku":"ACC-NUTBAG-COTTON","price":89.0,"sale_price":null},{"name":"Fine Mesh Strainer Set","sku":"ACC-STRAINER-SET","price":129.0,"sale_price":null},{"name":"Natural Brown Sugar - 10kg","sku":"BULK-SUGAR-10KG","price":349.0,"sale_price":null},{"name":"Natural Brown Sugar - 25kg","sku":"BULK-SUGAR-25KG","price":749.0,"sale_price":null},{"name":"Natural Brown Sugar - 2kg","sku":"BULK-SUGAR-2KG","price":89.0,"sale_price":null},{"name":"Natural Brown Sugar - 50kg","sku":"BULK-SUGAR-50KG","price":1349.0,"sale_price":null},{"name":"Complete Fermentation Starter Kit","sku":"BUNDLE-FERMENT","price":899.0,"sale_price":null},{"name":"Kefir Starter Bundle","sku":"BUNDLE-KEFIR","price":449.0,"sale_price":null},{"name":"Fresh Wheatgrass Tray","sku":"CROP-WG-TRAY","price":80.0,"sale_price":null},{"name":"Apple Cider Vinegar Mother","sku":"CULT-ACV","price":200.0,"sale_price":null},{"name":"Raw Apple Cider Vinegar Mother – 10 Live Cultures Combo (Dairy-Free Starter Kit)","sku":"CULT-ACV-10COMBO","price":1400.0,"sale_price":null},{"name":"Buttermilk Culture","sku":"CULT-BUTTERMILK","price":149.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 10 Litres","sku":"CULT-CHL-10L","price":6499.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 1 Litre","sku":"CULT-CHL-1L","price":849.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 20 Litres","sku":"CULT-CHL-20L","price":12499.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 250ml","sku":"CULT-CHL-250ML","price":249.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 500ml","sku":"CULT-CHL-500ML","price":449.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 50 Litres","sku":"CULT-CHL-50L","price":29999.0,"sale_price":null},{"name":"Chlorella Vulgaris Live Culture 5 Litres","sku":"CULT-CHL-5L","price":3499.0,"sale_price":null},{"name":"Coconut Milk Kefir Starter","sku":"CULT-COCO-MK","price":350.0,"sale_price":null},{"name":"Genuine Live Ginger Beer Plant (GBP)","sku":"CULT-GBP","price":200.0,"sale_price":null},{"name":"Ginger Bug Starter Culture","sku":"CULT-GINGERBUG","price":200.0,"sale_price":null},{"name":"Black Tea Kombucha SCOBY","sku":"CULT-KOMB-BLACK","price":200.0,"sale_price":null},{"name":"Coffee Kombucha SCOBY","sku":"CULT-KOMB-COFFEE","price":250.0,"sale_price":null},{"name":"Green Tea Kombucha SCOBY","sku":"CULT-KOMB-GREEN","price":250.0,"sale_price":null},{"name":"Rooibos Kombucha SCOBY","sku":"CULT-KOMB-ROOIBOS","price":250.0,"sale_price":null},{"name":"Lacto Fermentation Starter","sku":"CULT-LACTO","price":149.0,"sale_price":null},{"name":"Milk Kefir Grains (Live Culture)","sku":"CULT-MK","price":200.0,"sale_price":null},{"name":"Natto Starter Culture","sku":"CULT-NATTO","price":219.0,"sale_price":null},{"name":"Red Wine Vinegar Mother","sku":"CULT-RWV","price":200.0,"sale_price":null},{"name":"Rye Sourdough Starter","sku":"CULT-SD-RYE","price":200.0,"sale_price":null},{"name":"White Bread Sourdough Starter","sku":"CULT-SD-WHITE","price":200.0,"sale_price":null},{"name":"Wholegrain Sourdough Starter","sku":"CULT-SD-WHOLE","price":200.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 10 Litres","sku":"CULT-SPI-10L","price":6499.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 1 Litre","sku":"CULT-SPI-1L","price":849.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 20 Litres","sku":"CULT-SPI-20L","price":12499.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 250ml","sku":"CULT-SPI-250ML","price":249.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 500ml","sku":"CULT-SPI-500ML","price":449.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 50 Litres","sku":"CULT-SPI-50L","price":29999.0,"sale_price":null},{"name":"Spirulina Platensis Live Culture 5 Litres","sku":"CULT-SPI-5L","price":3499.0,"sale_price":null},{"name":"Tempeh Starter Culture","sku":"CULT-TEMPEH","price":199.0,"sale_price":null},{"name":"Water Kefir Grains (Live Culture – Dairy-Free)","sku":"CULT-WK","price":200.0,"sale_price":null},{"name":"Water Kefir Grains Bulk Pack (10 Live Cultures – Dairy-Free)","sku":"CULT-WK-BULK10","price":1400.0,"sale_price":null},{"name":"White Wine Vinegar Mother","sku":"CULT-WWV","price":200.0,"sale_price":null},{"name":"Bulgarian Yogurt Culture","sku":"CULT-YOG-BULG","price":179.0,"sale_price":null},{"name":"Greek Yogurt Culture","sku":"CULT-YOG-GREEK","price":179.0,"sale_price":null},{"name":"Black Dragon Dark Flesh Cutting","sku":"CUT-BLACK-DARK","price":1799.97,"sale_price":null},{"name":"Black Dragon Fruit Cutting","sku":"CUT-BLACKDRAGON","price":500.0,"sale_price":null},{"name":"Lemon Lime Variegated Dragon Fruit – Unrooted Cutting","sku":"CUT-LEMONLIME-VAR","price":1000.0,"sale_price":null},{"name":"Purple Haze Cutting","sku":"CUT-PURPLEHAZE","price":400.0,"sale_price":null},{"name":"Ruby Red Dragon Fruit Cuttings (4 Pack)","sku":"CUT-RUBY-4PK","price":350.0,"sale_price":null},{"name":"Ruby Red Purple Flesh Cutting","sku":"CUT-RUBY-PURPLE","price":350.0,"sale_price":null},{"name":"Worth Variegated Dragon Fruit – Unrooted Cutting","sku":"CUT-WORTH-VAR","price":1000.0,"sale_price":null},{"name":"Yellow Amarillo Dragon Fruit Cutting","sku":"CUT-YELLOWAMARILLO","price":450.0,"sale_price":null},{"name":"Mixed Dragon Fruit Plants Combo (5 Premium Varieties)","sku":"DF-COMBO-5","price":1000.0,"sale_price":null},{"name":"150 Purple Haze Dragon Fruit Plants","sku":"DF-PH-150","price":15000.0,"sale_price":null},{"name":"Purple Haze Dragon Fruit Plants - 600 Plant Commercial Plant Tray Pack","sku":"DF-PH-600","price":32000.0,"sale_price":null},{"name":"Black Dragon Fruit Africana Hybrid (Premium Rare Variety)","sku":"DF-RARE-BLACKAF","price":4500.0,"sale_price":null},{"name":"1000 Ruby Dragon Fruit Plants","sku":"DF-RUBY-1000","price":28000.0,"sale_price":null},{"name":"Ruby Dragon Fruit Plants - 150 Plant Commercial Plant Tray Pack","sku":"DF-RUBY-150","price":5700.0,"sale_price":null},{"name":"600 Ruby Dragon Fruit Plants","sku":"DF-RUBY-600","price":18000.0,"sale_price":null},{"name":"Sweet White Dragon Fruit Plants – 1000 Plant Commercial Plant Tray Pack","sku":"DF-SWC-1000","price":28000.0,"sale_price":null},{"name":"Sweet White Dragon Fruit Plants – 600 Plant Commercial Plant Tray Pack","sku":"DF-SWC-600","price":18000.0,"sale_price":null},{"name":"Alice Sweet","sku":"DF-VAR-ALICESWEET","price":400.0,"sale_price":null},{"name":"American Beauty","sku":"DF-VAR-AMBEAUTY","price":400.0,"sale_price":null},{"name":"Amazon Yellow","sku":"DF-VAR-AMZYELLOW","price":3000.0,"sale_price":null},{"name":"Armando","sku":"DF-VAR-ARMANDO","price":400.0,"sale_price":null},{"name":"Asunta 1","sku":"DF-VAR-ASUNTA1","price":400.0,"sale_price":null},{"name":"Asunta 2","sku":"DF-VAR-ASUNTA2","price":400.0,"sale_price":null},{"name":"Asunta 3","sku":"DF-VAR-ASUNTA3","price":400.0,"sale_price":null},{"name":"Asunta 5","sku":"DF-VAR-ASUNTA5","price":400.0,"sale_price":null},{"name":"Ax","sku":"DF-VAR-AX","price":400.0,"sale_price":null},{"name":"Arizona Purple","sku":"DF-VAR-AZPURPLE","price":400.0,"sale_price":null},{"name":"Baby Cerrado","sku":"DF-VAR-BABYCERRADO","price":400.0,"sale_price":null},{"name":"Bahamut","sku":"DF-VAR-BAHAMUT","price":400.0,"sale_price":null},{"name":"Black Dragon","sku":"DF-VAR-BLACKDRAGON","price":850.0,"sale_price":null},{"name":"Bloody Mary","sku":"DF-VAR-BLOODYMARY","price":400.0,"sale_price":null},{"name":"Boreal Red","sku":"DF-VAR-BOREALRED","price":400.0,"sale_price":null},{"name":"Bruni","sku":"DF-VAR-BRUNI","price":400.0,"sale_price":null},{"name":"Bundy Red Hybrid","sku":"DF-VAR-BUNDYRED","price":400.0,"sale_price":null},{"name":"Chameleon","sku":"DF-VAR-CHAMELEON","price":600.0,"sale_price":null},{"name":"Red Green Chimera","sku":"DF-VAR-CHIMERA","price":1000.0,"sale_price":null},{"name":"Colombian Yellow","sku":"DF-VAR-COLYELLOW","price":600.0,"sale_price":null},{"name":"Condor","sku":"DF-VAR-CONDOR","price":400.0,"sale_price":null},{"name":"Connie Mayer","sku":"DF-VAR-CONNIEMAYER","price":400.0,"sale_price":null},{"name":"Cosmic Charlie","sku":"DF-VAR-COSMIC","price":400.0,"sale_price":null},{"name":"Dark Star","sku":"DF-VAR-DARKSTAR","price":400.0,"sale_price":null},{"name":"David Bowie","sku":"DF-VAR-DAVIDBOWIE","price":400.0,"sale_price":null},{"name":"Delight","sku":"DF-VAR-DELIGHT","price":400.0,"sale_price":null},{"name":"Desert King","sku":"DF-VAR-DESERTKING","price":600.0,"sale_price":null},{"name":"Desert Princess","sku":"DF-VAR-DESERTPRIN","price":600.0,"sale_price":null},{"name":"Ecuador Palora","sku":"DF-VAR-ECU PALORA","price":800.0,"sale_price":null},{"name":"Edgars Baby","sku":"DF-VAR-EDGARSBABY","price":600.0,"sale_price":null},{"name":"Godzilla","sku":"DF-VAR-GODZILLA","price":2800.0,"sale_price":null},{"name":"Golden Variegated","sku":"DF-VAR-GOLDENVAR","price":3000.0,"sale_price":null},{"name":"Halleys Comet","sku":"DF-VAR-HALLEYSCOMET","price":400.0,"sale_price":null},{"name":"Harpua","sku":"DF-VAR-HARPUA","price":400.0,"sale_price":null},{"name":"Hawaiian Red","sku":"DF-VAR-HAWAIIANRED","price":400.0,"sale_price":null},{"name":"Hells Boy","sku":"DF-VAR-HELLSBOY","price":400.0,"sale_price":null},{"name":"Houghton","sku":"DF-VAR-HOUGHTON","price":400.0,"sale_price":null},{"name":"King Kong","sku":"DF-VAR-KINGKONG","price":400.0,"sale_price":null},{"name":"Lake Atitlan","sku":"DF-VAR-LAKEATITLAN","price":400.0,"sale_price":null},{"name":"La Verne Red","sku":"DF-VAR-LAVERNERED","price":1000.0,"sale_price":null},{"name":"Lime Variegated","sku":"DF-VAR-LIMEVAR","price":1500.0,"sale_price":null},{"name":"Lisa","sku":"DF-VAR-LISA","price":400.0,"sale_price":null},{"name":"M1","sku":"DF-VAR-M1","price":400.0,"sale_price":null},{"name":"Makisupa","sku":"DF-VAR-MAKISUPA","price":400.0,"sale_price":null},{"name":"Maria Rosa","sku":"DF-VAR-MARIAROSA","price":400.0,"sale_price":null},{"name":"Ocamponis","sku":"DF-VAR-OCAMPONIS","price":400.0,"sale_price":null},{"name":"Orejona","sku":"DF-VAR-OREJONA","price":400.0,"sale_price":null},{"name":"Paul Thompson","sku":"DF-VAR-PAULTHOMPSON","price":400.0,"sale_price":null},{"name":"Peruvian Yellow","sku":"DF-VAR-PERYELLOW","price":800.0,"sale_price":null},{"name":"Physical Graffiti","sku":"DF-VAR-PHYSGRAFFITI","price":400.0,"sale_price":null},{"name":"Pure Gold","sku":"DF-VAR-PUREGOLD","price":2000.0,"sale_price":null},{"name":"Purple Haze","sku":"DF-VAR-PURPLEHAZE","price":400.0,"sale_price":null},{"name":"Purple Megalanthus","sku":"DF-VAR-PURPLEMEG","price":400.0,"sale_price":null},{"name":"Rainbow","sku":"DF-VAR-RAINBOW","price":600.0,"sale_price":null},{"name":"Red Crystal","sku":"DF-VAR-REDCRYSTAL","price":400.0,"sale_price":null},{"name":"Red Jaina","sku":"DF-VAR-REDJAINA","price":400.0,"sale_price":null},{"name":"Rixford","sku":"DF-VAR-RIXFORD","price":400.0,"sale_price":null},{"name":"Ruby Red","sku":"DF-VAR-RUBYRED","price":350.0,"sale_price":null},{"name":"Seoul Kitchen","sku":"DF-VAR-SEOULKITCHEN","price":400.0,"sale_price":null},{"name":"Sin Espinas","sku":"DF-VAR-SINESPINAS","price":400.0,"sale_price":null},{"name":"S. Setaceus","sku":"DF-VAR-SSETACEUS","price":400.0,"sale_price":null},{"name":"Sugar Dragon S8","sku":"DF-VAR-SUGARDRAGONS8","price":400.0,"sale_price":null},{"name":"Super Shenro","sku":"DF-VAR-SUPERSHENRO","price":400.0,"sale_price":null},{"name":"Thick King","sku":"DF-VAR-THICKKING","price":400.0,"sale_price":null},{"name":"Townsend Pink","sku":"DF-VAR-TOWNSEND","price":400.0,"sale_price":null},{"name":"Tricia","sku":"DF-VAR-TRICIA","price":400.0,"sale_price":null},{"name":"Trish Red","sku":"DF-VAR-TRISHRED","price":400.0,"sale_price":null},{"name":"Valdivia Roja","sku":"DF-VAR-VALDIVIA","price":400.0,"sale_price":null},{"name":"Vietnam Green Skin Red Flesh","sku":"DF-VAR-VIETGREENRED","price":600.0,"sale_price":null},{"name":"Vietnamese Jaina","sku":"DF-VAR-VIETJAINA","price":320.0,"sale_price":null},{"name":"Voodoo Child","sku":"DF-VAR-VOODOOCHILD","price":400.0,"sale_price":null},{"name":"White Crystal","sku":"DF-VAR-WHITECRYSTAL","price":400.0,"sale_price":null},{"name":"White King Hollywood","sku":"DF-VAR-WHITEKINGHW","price":400.0,"sale_price":null},{"name":"White Sapphire","sku":"DF-VAR-WHITESAPH","price":400.0,"sale_price":null},{"name":"White Supreme","sku":"DF-VAR-WHITESUP","price":400.0,"sale_price":null},{"name":"Yellow Amarillo","sku":"DF-VAR-YELLOWAMARILLO","price":1000.0,"sale_price":null},{"name":"Yellow Gold","sku":"DF-VAR-YELLOWGOLD","price":3500.0,"sale_price":null},{"name":"Yellow Phalora","sku":"DF-VAR-YELPHALORA","price":1000.0,"sale_price":null},{"name":"Zamorano","sku":"DF-VAR-ZAMORANO","price":400.0,"sale_price":null},{"name":"Zorro","sku":"DF-VAR-ZORRO","price":400.0,"sale_price":null},{"name":"1000 Zamorano Dragon Fruit Plants","sku":"DF-ZAM-1000","price":23000.0,"sale_price":null},{"name":"Zamorano Dragon Fruit Plants - 150 Plant Commercial Plant Tray Pack","sku":"DF-ZAM-150","price":15000.0,"sale_price":null},{"name":"Zamorano Dragon Fruit Plants - 600 Golden (Israel) - 600 Plant Commercial Plant Tray Pack","sku":"DF-ZAM-600G","price":18000.0,"sale_price":null},{"name":"FARM-050-PLANTS-RUBY™","sku":"FARM-050-RUBY","price":2400.0,"sale_price":null},{"name":"FARM-100-PLANTS-RUBY™","sku":"FARM-100-RUBY","price":4300.0,"sale_price":null},{"name":"FARM-1000-PLANTS-RUBY™","sku":"FARM-1000-RUBY","price":26000.0,"sale_price":null},{"name":"FARM-150-PLANTS-RUBY™","sku":"FARM-150-RUBY","price":6000.0,"sale_price":null},{"name":"FARM-150-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-150-SWC","price":8250.0,"sale_price":null},{"name":"FARM-200-PLANTS-RUBY™","sku":"FARM-200-RUBY","price":7600.0,"sale_price":null},{"name":"FARM-200-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-200-SWC","price":10800.0,"sale_price":null},{"name":"FARM-250-PLANTS-RUBY™","sku":"FARM-250-RUBY","price":9000.0,"sale_price":null},{"name":"FARM-250-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-250-SWC","price":13250.0,"sale_price":null},{"name":"FARM-300-PLANTS-RUBY™","sku":"FARM-300-RUBY","price":10200.0,"sale_price":null},{"name":"FARM-300-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-300-SWC","price":15600.0,"sale_price":null},{"name":"FARM-400-PLANTS-RUBY™","sku":"FARM-400-RUBY","price":13200.0,"sale_price":null},{"name":"FARM-400-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-400-SWC","price":20400.0,"sale_price":null},{"name":"FARM-500-PLANTS-RUBY™","sku":"FARM-500-RUBY","price":16000.0,"sale_price":null},{"name":"FARM-500-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-500-SWC","price":25000.0,"sale_price":null},{"name":"FARM-600-PLANTS-RUBY™","sku":"FARM-600-RUBY","price":18000.0,"sale_price":null},{"name":"FARM-600-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-600-SWC","price":29400.0,"sale_price":null},{"name":"FARM-700-PLANTS-RUBY™","sku":"FARM-700-RUBY","price":20300.0,"sale_price":null},{"name":"FARM-700-PLANTS-SWEET-WHITE-CRYSTAL™","sku":"FARM-700-SWC","price":33600.0,"sale_price":null},{"name":"FARM-800-PLANTS-RUBY™","sku":"FARM-800-RUBY","price":22400.0,"sale_price":null},{"name":"FARM-900-PLANTS-RUBY™","sku":"FARM-900-RUBY","price":24300.0,"sale_price":null},{"name":"BioGreen A-Z Fertilizer - 1L","sku":"FERT-BIOGREEN-1L","price":299.0,"sale_price":null},{"name":"BioGreen A-Z Fertilizer - 20L","sku":"FERT-BIOGREEN-20L","price":3699.0,"sale_price":null},{"name":"BioGreen A-Z Fertilizer - 5L","sku":"FERT-BIOGREEN-5L","price":1099.0,"sale_price":null},{"name":"Premium Chlorella Growth Fertilizer (1kg Powder)","sku":"FERT-CHL-1KG","price":870.0,"sale_price":545.0},{"name":"Premium Chlorella Growth Fertilizer (250ml Powder)","sku":"FERT-CHL-250ML","price":250.0,"sale_price":null},{"name":"Premium Spirulina Growth Fertilizer (1kg Powder)","sku":"FERT-SPI-1KG","price":870.0,"sale_price":545.0},{"name":"Premium Spirulina Growth Fertilizer (250ml Powder)","sku":"FERT-SPI-250ML","price":250.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Summer Berries Flavour (5L Mix)","sku":"FROYOG-BERRIES-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Black Currant Flavour (5L Mix)","sku":"FROYOG-BLACKCUR-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Fruit of the Forest (5L Mix)","sku":"FROYOG-FOF-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Lichee Flavour (5L Mix)","sku":"FROYOG-LICHEE-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Peach Flavour (5L Mix)","sku":"FROYOG-PEACH-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – Strawberry Flavour (5L Mix)","sku":"FROYOG-STRAW-5L","price":350.0,"sale_price":null},{"name":"Frozen Yogurt Powder – English Toffee Flavour (5L Mix)","sku":"FROYOG-TOFFEE-5L","price":350.0,"sale_price":null},{"name":"Diatomaceous Earth - 10kg Food Grade","sku":"INPUT-DE-10KG","price":599.0,"sale_price":null},{"name":"Diatomaceous Earth - 1kg Food Grade","sku":"INPUT-DE-1KG","price":149.0,"sale_price":null},{"name":"Diatomaceous Earth - 25kg Food Grade","sku":"INPUT-DE-25KG","price":1199.0,"sale_price":null},{"name":"Coconut Water Kefir Kit","sku":"KIT-COCO-WK","price":350.0,"sale_price":null},{"name":"Milk Kefir Grains Starter Kit","sku":"KIT-MK-STARTER","price":300.0,"sale_price":null},{"name":"Water Kefir Grains Starter Kit","sku":"KIT-WK-STARTER","price":300.0,"sale_price":null},{"name":"Dragon Fruit Association Membership (12 Months)","sku":"MEM-DFA-12M","price":25000.0,"sale_price":null},{"name":"Dragon Fruit Association Membership (1 Month)","sku":"MEM-DFA-1M","price":3000.0,"sale_price":null},{"name":"Dragon Fruit Association Membership (3 Months)","sku":"MEM-DFA-3M","price":6000.0,"sale_price":null},{"name":"Dragon Fruit Association Membership (6 Months)","sku":"MEM-DFA-6M","price":12000.0,"sale_price":null},{"name":"Soya Beans - 10kg","sku":"SEED-SOYA-10KG","price":359.0,"sale_price":null},{"name":"Soya Beans - 25kg","sku":"SEED-SOYA-25KG","price":799.0,"sale_price":null},{"name":"Soya Beans - 5kg","sku":"SEED-SOYA-5KG","price":160.0,"sale_price":null},{"name":"Wheatgrass Seeds - 10kg","sku":"SEED-WG-10KG","price":320.0,"sale_price":null},{"name":"Wheatgrass Seeds - 25kg","sku":"SEED-WG-25KG","price":1199.0,"sale_price":null},{"name":"Wheatgrass Seeds - 5kg","sku":"SEED-WG-5KG","price":160.0,"sale_price":null},{"name":"1 Hectare Dragon Fruit Business Plan","sku":"SERV-BP-1HA","price":1500.0,"sale_price":null},{"name":"2 Hectare Dragon Fruit Business Plan","sku":"SERV-BP-2HA","price":1500.0,"sale_price":null},{"name":"3 Hectare Dragon Fruit Business Plan","sku":"SERV-BP-3HA","price":1500.0,"sale_price":null},{"name":"5 Hectare Dragon Fruit Business Plan","sku":"SERV-BP-5HA","price":1500.0,"sale_price":null},{"name":"Complete Dragon Fruit Business Plan Combo","sku":"SERV-BP-COMBO","price":1500.0,"sale_price":null},{"name":"One-on-One Consultation","sku":"SERV-CONSULT-1ON1","price":250.0,"sale_price":null},{"name":"Premium Genetics Consultation","sku":"SERV-CONSULT-GENETICS","price":850.0,"sale_price":null},{"name":"Farm Setup Consulting Package","sku":"SERV-CONSULT-SETUP","price":1850.0,"sale_price":null},{"name":"Video Consultation","sku":"SERV-CONSULT-VIDEO","price":250.0,"sale_price":null},{"name":"Farm Visit & Consultation Package","sku":"SERV-CONSULT-VISIT","price":850.0,"sale_price":null},{"name":"Agricultural Funding Manual & Contact Directory","sku":"SERV-FUND-MANUAL","price":250.0,"sale_price":null},{"name":"Cutting Rooting Service P.P","sku":"SERV-ROOTING-PP","price":30.0,"sale_price":null},{"name":"BioSoil EM1 - 1L","sku":"SOIL-BIOSOIL-1L","price":279.0,"sale_price":null},{"name":"BioSoil EM1 - 5L","sku":"SOIL-BIOSOIL-5L","price":999.0,"sale_price":null},{"name":"BioPond EM1 - 1L","sku":"SOIL-EM1POND-1L","price":299.0,"sale_price":null},{"name":"BioPond EM1 - 20L","sku":"SOIL-EM1POND-20L","price":3499.0,"sale_price":null},{"name":"BioPond EM1 - 5L","sku":"SOIL-EM1POND-5L","price":1099.0,"sale_price":null},{"name":"EM1 Soil Treatment - 1L","sku":"SOIL-EM1TRT-1L","price":249.0,"sale_price":null},{"name":"EM1 Soil Treatment - 20L","sku":"SOIL-EM1TRT-20L","price":2999.0,"sale_price":null},{"name":"EM1 Soil Treatment - 5L","sku":"SOIL-EM1TRT-5L","price":899.0,"sale_price":null}];

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
  const exact = CATALOGUE.filter((p) => (p.sku || "").toLowerCase() === q);
  if (exact.length) return exact;
  return CATALOGUE.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
  ).slice(0, 25);
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
          "Customer-service policy and product lookup for Healthy Fields SA. Call " +
          "get_reply_policy before composing any customer reply. Never promise anything \u2014 " +
          "defer with 'Can I get back to you?'. No refunds. Outbound messages only between " +
          "07:00 and 17:00 South African time.",
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
      const now = sastNow();
      const open = now.getUTCHours() >= OPEN_HOUR && now.getUTCHours() < CLOSE_HOUR;
      return json({
        server: "healthyfields-service-policy",
        status: "ok",
        tools: TOOLS.length,
        mcp_endpoint: url.origin + "/mcp",
        now_sast: fmt(now),
        within_business_hours: open,
        catalogue_products: CATALOGUE.length,
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
