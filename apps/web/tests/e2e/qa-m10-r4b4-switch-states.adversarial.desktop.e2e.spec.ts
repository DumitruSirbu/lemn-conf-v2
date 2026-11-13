// An item's switch row in every state, at desktop 1440 x 900 with a pointer; the scenarios are in the support module,
// which the phone line runs too.
import { describeSwitchStates } from "./support/qa-m10-r4b4-switch-states";

describeSwitchStates({ width: 1440, height: 900, label: "1440" });
