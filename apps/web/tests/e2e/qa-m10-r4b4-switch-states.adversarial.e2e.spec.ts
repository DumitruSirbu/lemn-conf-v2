// An item's switch row in every state, at 390 x 844 with real touch; the scenarios are in the support module, which the
// desktop line runs too.
import { describeSwitchStates } from "./support/qa-m10-r4b4-switch-states";

describeSwitchStates({ width: 390, height: 844, label: "390" });
