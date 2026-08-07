var q = [
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"G",
	"H",
	"I",
	"J",
	"K",
	"L",
	"M",
	"N",
	"O",
	"P",
	"Q",
	"R",
	"S",
	"T",
	"U",
	"V",
	"W",
	"X",
	"Y",
	"Z",
	"a",
	"b",
	"c",
	"d",
	"e",
	"f",
	"g",
	"h",
	"i",
	"j",
	"k",
	"l",
	"m",
	"n",
	"o",
	"p",
	"q",
	"r",
	"s",
	"t",
	"u",
	"v",
	"w",
	"x",
	"y",
	"z",
	"#",
	"$",
	"%",
	"*",
	"+",
	",",
	"-",
	".",
	":",
	";",
	"=",
	"?",
	"@",
	"[",
	"]",
	"^",
	"_",
	"{",
	"|",
	"}",
	"~"
], p = (t, e) => {
	var a = "";
	for (let o = 1; o <= e; o++) {
		let h = Math.floor(t) / Math.pow(83, e - o) % 83;
		a += q[Math.floor(h)];
	}
	return a;
}, f = (t) => {
	let e = t / 255;
	return e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4);
}, h = (t) => {
	let e = Math.max(0, Math.min(1, t));
	return e <= .0031308 ? Math.trunc(12.92 * e * 255 + .5) : Math.trunc(255 * (1.055 * Math.pow(e, .4166666666666667) - .055) + .5);
}, M = (t, e) => ((t) => t < 0 ? -1 : 1)(t) * Math.pow(Math.abs(t), e), d = class extends Error {
	constructor(t) {
		super(t), this.name = "ValidationError", this.message = t;
	}
}, D = (t, e, a, o) => {
	let h = 0, r = 0, n = 0, i = 4 * e;
	for (let l = 0; l < e; l++) {
		let e = 4 * l;
		for (let s = 0; s < a; s++) {
			let a = e + s * i, g = o(l, s);
			h += g * f(t[a]), r += g * f(t[a + 1]), n += g * f(t[a + 2]);
		}
	}
	let s = 1 / (e * a);
	return [
		h * s,
		r * s,
		n * s
	];
}, S = (t, e, a, o, r) => {
	if (o < 1 || o > 9 || r < 1 || r > 9) throw new d("BlurHash must have between 1 and 9 components");
	if (e * a * 4 !== t.length) throw new d("Width and height must match the pixels array");
	let n = [];
	for (let h = 0; h < r; h++) for (let r = 0; r < o; r++) {
		let o = 0 == r && 0 == h ? 1 : 2, i = D(t, e, a, (t, n) => o * Math.cos(Math.PI * r * t / e) * Math.cos(Math.PI * h * n / a));
		n.push(i);
	}
	let i, s = n[0], l = n.slice(1), g = "";
	if (g += p(o - 1 + 9 * (r - 1), 1), l.length > 0) {
		let t = Math.max(...l.map((t) => Math.max(...t))), e = Math.floor(Math.max(0, Math.min(82, Math.floor(166 * t - .5))));
		i = (e + 1) / 166, g += p(e, 1);
	} else i = 1, g += p(0, 1);
	return g += p(((t) => (h(t[0]) << 16) + (h(t[1]) << 8) + h(t[2]))(s), 4), l.forEach((t) => {
		g += p(((t, e) => 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * M(t[0] / e, .5) + 9.5)))) * 19 + 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * M(t[1] / e, .5) + 9.5)))) + Math.floor(Math.max(0, Math.min(18, Math.floor(9 * M(t[2] / e, .5) + 9.5)))))(t, i), 2);
	}), g;
};
self.onmessage = async (t) => {
	if ("PROCESS_IMAGE" !== t.data?.type) return;
	const { id: e, file: a, targetWidth: o, targetHeight: h, quality: r, computeBlurhash: n } = t.data;
	try {
		let t, l;
		try {
			const e = await createImageBitmap(a, {
				resizeWidth: o,
				resizeHeight: h,
				resizeQuality: "high"
			});
			if (t = new OffscreenCanvas(o, h), l = t.getContext("2d"), !l) throw new Error("Failed to get 2d context from OffscreenCanvas");
			l.drawImage(e, 0, 0, o, h), e.close();
		} catch (i) {
			console.warn("Hardware resize failed, falling back to stepped software scaling:", i);
			const e = await a.arrayBuffer(), r = new Blob([e], { type: a.type }), n = await createImageBitmap(r);
			let s = n.width, g = n.height, f = new OffscreenCanvas(s, g), c = f.getContext("2d");
			for (c.imageSmoothingEnabled = !0, c.imageSmoothingQuality = "high", c.drawImage(n, 0, 0); .5 * f.width > o && .5 * f.height > h;) {
				const t = new OffscreenCanvas(Math.floor(.5 * f.width), Math.floor(.5 * f.height)), e = t.getContext("2d");
				e.imageSmoothingEnabled = !0, e.imageSmoothingQuality = "high", e.drawImage(f, 0, 0, t.width, t.height), f = t;
			}
			t = new OffscreenCanvas(o, h), l = t.getContext("2d"), l.imageSmoothingEnabled = !0, l.imageSmoothingQuality = "high", l.drawImage(f, 0, 0, o, h), n.close();
		}
		let g = null;
		if (n) try {
			const t = l.getImageData(0, 0, o, h);
			g = S(t.data, o, h, 4, 3);
		} catch (s) {
			console.warn("Could not generate blurhash (possible canvas fingerprinting protection):", s);
		}
		const f = await t.convertToBlob({
			type: "image/jpeg",
			quality: r
		}), c = `${o}x${h}`;
		self.postMessage({
			id: e,
			success: !0,
			blob: f,
			dim: c,
			blurhash: g
		});
	} catch (l) {
		self.postMessage({
			id: e,
			success: !1,
			error: l.message
		});
	}
};
