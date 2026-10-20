import { ServiceListing } from "../components/services/ServiceListing";

/**
 * /services — one line into the shared listing (TASK B3-3). No loader/meta
 * here: the listing owns its query, React 19 hoists the title it renders, and
 * the page stays prerenderable (skeleton only, no API data).
 */
export default function ServicesRoute() {
  return <ServiceListing />;
}