// Zod's eval probe breaks the enforced CSP, so every domain module takes `z` from here (8Q.10, ADR 0161
// decision 9). This call is the domain's one module-scope effect, and no precedent for another.
import { z } from "zod";

z.config({ jitless: true });

export { z };
