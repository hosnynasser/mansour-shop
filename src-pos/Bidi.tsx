// أسماء الأصناف العربي فيها أرقام ومقاسات (2×1.1/2 أو 20 امبير): بنعزل كل جزء أرقام/لاتيني LTR
// عشان الترتيب يظهر زي ما اتكتب، من غير ما يتعدل الاسم المتخزن.
const RUN = /([0-9A-Za-z][0-9A-Za-z.,/×*+\-"'%]*)/g;
export default function PN({ t }: { t?: string }) {
    const s = String(t ?? '');
    return <>{s.split(RUN).map((part, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{part}</bdi> : part))}</>;
}
