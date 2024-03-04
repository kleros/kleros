export type HashType =
  | string
  | number
  | boolean
  | import("bn.js")
  | { type: string; value: string }
  | { t: string; v: string | number | import("bn.js") }
  | null;
