import { Layers } from "lucide-react";
import type { Lang } from "./i18n";

interface Props {
  onPick: (lang: Lang) => void;
}

// First-run language picker (shown before login). Language-neutral on purpose.
export default function Onboarding({ onPick }: Props) {
  return (
    <div className="onboard widget" dir="rtl">
      <div className="onboardinner">
        <Layers size={34} color="var(--blue)" />
        <div className="onboardtitle">
          زبان را انتخاب کنید
          <br />
          Choose your language
        </div>
        <div className="onboardbtns">
          <button className="onboardbtn" onClick={() => onPick("fa")}>
            فارسی
          </button>
          <button className="onboardbtn" onClick={() => onPick("en")}>
            English
          </button>
        </div>
      </div>
    </div>
  );
}
