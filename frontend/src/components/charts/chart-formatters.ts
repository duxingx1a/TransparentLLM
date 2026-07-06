export const shortDateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("zh-CN").format;
