import type { Metadata } from "next";
import IosAsset from "./ios-asset";

export const metadata: Metadata = {
  title: "Бойлер · Fixplan — iOS concept",
  description: "Тестовая мобильная карточка узла Fixplan.",
};

export default function Page() { return <IosAsset />; }
