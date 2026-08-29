import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createCampaign, generateBriefs, getCampaignOverview, getCityDetail, listCampaigns } from "../lib/api";
import { useCampaignContext } from "../lib/campaignContext";

const SUPPORTED_CITY_IDS = ["mumbai", "london", "tokyo", "sao_paulo", "new_york"];
const CAMPAIGN_TYPES = ["film_promo_tour", "music_world_tour"];

interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
}

// Not using the `webmcp-types` npm package (github.com/GoogleChromeLabs) to
// avoid a new dependency for one component -- this mirrors its shape
// closely enough to swap in later if this graduates past origin-trial.
type ToolDefinition = Record<string, unknown> & {
  registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown;
};

/**
 * WebMCP (https://developer.chrome.com/docs/ai/webmcp) lets an AI agent
 * running in the SAME browser tab as the visitor -- a sidebar assistant, an
 * extension -- call this page's own functions directly instead of clicking
 * through the UI, via document.modelContext.registerTool(...). It has
 * nothing to do with this project's own backend multi-agent system (Culture
 * Intelligence, Fan Enthusiasm, etc.), which talks to Dialogflow CX over
 * HTTP and is completely untouched by this file.
 *
 * Confirmed live (Chrome 151, 2026-08-28): document.modelContext is still
 * undefined without a per-origin trial token -- the API has NOT graduated
 * to default-on. It shipped as a Chrome 149 origin trial (June 2026);
 * Edge 147+ ships it by default, no trial needed. The entry point moved to
 * document.modelContext as of the shipped build (navigator.modelContext is
 * deprecated as of Chrome 150 but kept here as a fallback), and cleanup
 * moved from a returned unregister() handle to an AbortController passed in
 * at registration -- registerTool(tool, { signal }), then controller.abort()
 * -- which is what this file now does. Every call is still feature-detected
 * and wrapped so an unsupported browser (the default today, everywhere
 * except an enrolled Chrome 149+/Edge 147+) pays zero cost.
 */
export function WebMcpTools() {
  const navigate = useNavigate();
  const { setActiveCampaignId, refresh } = useCampaignContext();

  useEffect(() => {
    const modelContext =
      (document as unknown as { modelContext?: ToolDefinition }).modelContext ??
      (navigator as unknown as { modelContext?: ToolDefinition }).modelContext;
    if (typeof modelContext?.registerTool !== "function") return;
    // registerTool is a native platform-object method -- calling it detached
    // from modelContext (even via a null-checked local const) throws
    // "Illegal invocation", since it loses the internal [[this]] binding the
    // browser's implementation requires. Confirmed live against a real
    // origin-trial token: this bit us for real, silently, until caught via
    // the console's [EXCEPTION] log (our own try/catch was swallowing it).
    const registerTool = modelContext.registerTool.bind(modelContext);

    const controller = new AbortController();
    function register(tool: ToolDefinition) {
      try {
        registerTool(tool, { signal: controller.signal });
      } catch {
        // Shape mismatch against whatever this browser actually shipped --
        // never let a WebMCP registration failure touch the app.
      }
    }
    function textResult(value: unknown): WebMcpToolResult {
      return { content: [{ type: "text", text: JSON.stringify(value) }] };
    }

    register({
      name: "list_campaigns",
      description: "List every tour campaign in Tour Intelligence, with title, genre, campaign type, and status.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return textResult((await listCampaigns()).campaigns);
      },
    });

    register({
      name: "get_campaign_overview",
      description:
        "Get a campaign's city-by-city status: fan enthusiasm scores, brief status (pending/final), and delight card URLs.",
      inputSchema: {
        type: "object",
        properties: { campaign_id: { type: "string", description: "campaign_id, e.g. from list_campaigns" } },
        required: ["campaign_id"],
      },
      annotations: { readOnlyHint: true },
      async execute({ campaign_id }: { campaign_id: string }) {
        return textResult(await getCampaignOverview(campaign_id));
      },
    });

    register({
      name: "get_city_detail",
      description: "Get one city stop's full culture intelligence, local delight content, and talent brief.",
      inputSchema: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          city_id: { type: "string", enum: SUPPORTED_CITY_IDS },
        },
        required: ["campaign_id", "city_id"],
      },
      annotations: { readOnlyHint: true },
      async execute({ campaign_id, city_id }: { campaign_id: string; city_id: string }) {
        return textResult(await getCityDetail(campaign_id, city_id));
      },
    });

    register({
      name: "create_campaign",
      description:
        "Create a new tour campaign with its city stops. Stops are limited to the five cities with full " +
        "culture, fan, and delight coverage: mumbai, london, tokyo, sao_paulo, new_york.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          campaign_type: { type: "string", enum: CAMPAIGN_TYPES },
          genre: { type: "string" },
          talent_roster: { type: "array", items: { type: "string" } },
          stops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                city_id: { type: "string", enum: SUPPORTED_CITY_IDS },
                stop_date: { type: "string", description: "YYYY-MM-DD" },
              },
              required: ["city_id", "stop_date"],
            },
          },
          selected_metrics: {
            type: "array",
            items: { type: "string" },
            description: "Optional key metrics to fetch per city, e.g. literacy_rate, population.",
          },
        },
        required: ["title", "campaign_type", "genre", "stops"],
      },
      annotations: { destructiveHint: false },
      async execute(input: {
        title: string;
        campaign_type: string;
        genre: string;
        talent_roster?: string[];
        stops: { city_id: string; stop_date: string }[];
        selected_metrics?: string[];
      }) {
        const result = await createCampaign({
          talent_roster: [],
          selected_metrics: [],
          ...input,
        });
        // Same race as NewCampaign.tsx's handleSubmit -- must await the
        // refresh before activating the new id, or the self-heal effect in
        // campaignContext reverts it right back.
        await refresh();
        setActiveCampaignId(result.campaign_id);
        navigate("/");
        return textResult(result);
      },
    });

    register({
      name: "generate_briefs",
      description:
        "Start generating talent briefs for every pending city stop in a campaign. This kicks off a real " +
        "multi-agent pipeline that takes several minutes per city -- it returns as soon as the run has " +
        "started, not once it's finished.",
      inputSchema: {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
      annotations: { destructiveHint: false },
      async execute({ campaign_id }: { campaign_id: string }) {
        return textResult(await generateBriefs(campaign_id));
      },
    });

    return () => controller.abort();
  }, [navigate, setActiveCampaignId, refresh]);

  return null;
}
