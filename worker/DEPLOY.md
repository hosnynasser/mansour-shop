# نشر الباك إند (Cloudflare مجانا)

المطلوب: حساب Cloudflare (مجاني) — ممكن حساب حضرتك أو حساب صاحب المحل.

## الخطوات
1. اعمل حساب مجاني على cloudflare.com
2. ثبّت Node.js على أي جهاز، وبعدين:
   npm install -g wrangler
   wrangler login
3. في فولدر worker ده:
   wrangler kv namespace create SHOP_KV
   هيطلعلك id — حطه مكان PUT_KV_NAMESPACE_ID_HERE في wrangler.toml
4. اختار كود دخول للوحة التحكم وحطه كـ secret:
   wrangler secret put ADMIN_CODE
5. انشر:
   wrangler deploy
   هيطلعلك رابط زي: https://mansour-shop-api.<subdomain>.workers.dev
6. ابعتلنا الرابط — هنحطه في الموقع (سطر API_BASE في src/App.tsx) وننشر نسخة نهائية.

## بعد النشر
- لوحة التحكم: زرار "لوحة التحكم" تحت في الفوتر → كود الدخول اللي اخترته.
- أول مرة تفتح تاب المنتجات هتلاقي القايمة المبدئية جاهزة — عدّل الأسعار/الأسماء/الصور واضغط "حفظ التعديلات" وده اللي هيظهر للزباين.
- الطلبات بتيجي في تاب "الطلبات" وتقدر تعلّمها "تم التجهيز".
