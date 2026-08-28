import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createCampaign, generateBriefs, getCampaignOverview, getCityDetail, listCampaigns } from "../lib/api";
import { useCampaignContext } from "../lib/campaignContext";

const SUPPORTED_CITY_IDS = ["mumbai", "london", "tokyo", "sao_paulo", "new_york"];
const CAMPAIGN_TYPES = ["film_promo_tour", "music_world_tour"];

interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
}

// Draft/unstable browser API -- no shipped type defs to target.
type ToolDefinition = Record<string, unknown> & { registerTool?: (tool: Record<string, unknown>) => unknown };

/**
 * WebMCP (https://webmachinelearning.github.io/webmcp/) lets an AI agent
 * running in the SAME browser tab as the visitor -- a sidebar assistant, an
 * extension -- call this page's own functions directly instead of clicking
 * through the UI, via document.modelContext.registerTool(...). It has
 * nothing to do with this project's own backend multi-agent system (Culture
 * Intelligence, Fan Enthusiasm, etc.), which talks to Dialogflow CX over
 * HTTP and is completely untouched by this file.
 *
 * The spec is a W3C Draft Community Group Report -- Chrome origin-trial
 * only as of writing, not shipped by default anywhere, no committed Firefox
 * or Safari support. This genuinely can't be verified end-to-end without
 * that trial enabled, so every call here is feature-detected and wrapped so
 * an unsupported browser (almost everyone, right now) pays zero cost: one
 * property check, no script execution, per the spec's own stated best
 * practice ("never throw if the API is absent").
 */
export function WebMcpTools() {
  const navigate = useNavigate();
  const { setActiveCampaignId, refresh } = useCampaignContext();

  useEffect(() => {
    const modelContext =
      (document as unknown as { modelContext?: ToolDefinition }).modelContext ??
      (navigator as unknown as { modelContext?: ToolDefinition }).modelContext;
    const registerTool = modelContext?.registerTool;
    if (typeof registerTool !== "function") return;

    const registrations: unknown[] = [];
    function register(tool: ToolDefinition) {
      try {
        registrations.push(registerTool!(tool));
      } catch {
        // Draft spec -- this browser's shape may not match what we coded
        // against. Never let a WebMCP registration failure touch the app.
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
        refresh();
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

    return () => {
      for (const reg of registrations) {
        try {
          (reg as { unregister?: () => void })?.unregister?.();
        } catch {
          // best-effort cleanup only -- exact teardown shape isn't final in the draft spec
        }
      }
    };
  }, [navigate, setActiveCampaignId, refresh]);

  return null;
}
