import { useParams } from "react-router";
import { ServiceDetail } from "../components/services/ServiceDetail";

/**
 * /service/:slug — one line into the shared detail component (TASK B3-3). No
 * loader/meta/fallback here: the component owns its query and renders the
 * title, the same hydration pattern as /product/:slug.
 */
export default function ServiceRoute() {
  const { slug } = useParams();
  return <ServiceDetail slug={slug ?? ""} />;
}