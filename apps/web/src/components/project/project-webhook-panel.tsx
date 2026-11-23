import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Sparkles,
} from "@nocoo/basalt/icons";
import { Button } from "@nocoo/basalt/components/button";
import { Badge } from "@nocoo/basalt/components/badge";
import { Label } from "@nocoo/basalt/components/label";
import { LayerCard } from "@nocoo/basalt/components/layer-card";

interface ProjectWebhookPanelProps {
  webhookUrl: string;
  webhookToken: string;
  tokenVisible: boolean;
  copied: "token" | "webhook" | "prompt" | null;
  regenerating: boolean;
  promptText: string | null;
  promptLoading: boolean;
  onCopy: (text: string, type: "token" | "webhook" | "prompt") => void | Promise<void>;
  onToggleTokenVisible: () => void;
  onRegenerateToken: () => void | Promise<void>;
  onShowPrompt: () => void | Promise<void>;
}

export function ProjectWebhookPanel({
  webhookUrl,
  webhookToken,
  tokenVisible,
  copied,
  regenerating,
  promptText,
  promptLoading,
  onCopy,
  onToggleTokenVisible,
  onRegenerateToken,
  onShowPrompt,
}: ProjectWebhookPanelProps) {
  return (
    <div className="flex flex-col gap-basalt-layout-lg">
      <LayerCard>
        <LayerCard.Header>
          <div>
            <h2 className="text-basalt-lg font-semibold">Webhook Integration</h2>
            <p className="text-basalt-sm text-basalt-muted-foreground">Use these credentials to send backups from your AI agent.</p>
          </div>
        </LayerCard.Header>
        <LayerCard.Body className="flex flex-col gap-basalt-layout">
          <div className="flex flex-col gap-basalt-space-lg">
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-basalt-space-lg">
              <code className="flex-1 truncate rounded-basalt-md bg-basalt-control px-basalt-control-x py-basalt-control-y text-basalt-sm text-basalt-foreground">{webhookUrl}</code>
              <Button variant="outline" size="sm" aria-label="Copy webhook URL" onClick={() => void onCopy(webhookUrl, "webhook")} className="shrink-0">
                {copied === "webhook" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-basalt-space-lg">
            <Label>Authorization Token</Label>
            <div className="flex items-center gap-basalt-space-lg">
              <code className="flex-1 truncate rounded-basalt-md bg-basalt-control px-basalt-control-x py-basalt-control-y text-basalt-sm text-basalt-foreground">
                {!webhookToken ? "Token hidden - regenerate to view" : tokenVisible ? webhookToken : "•".repeat(24)}
              </code>
              <Button variant="outline" size="sm" aria-label={tokenVisible ? "Hide authorization token" : "Show authorization token"} onClick={onToggleTokenVisible} disabled={!webhookToken}>
                {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy authorization token" onClick={() => void onCopy(webhookToken, "token")} disabled={!webhookToken}>
                {copied === "token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex items-center gap-basalt-space-lg">
              <Button variant="outline" size="sm" onClick={() => void onRegenerateToken()} disabled={regenerating}>
                {regenerating ? <Loader2 className="mr-basalt-space-md h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-basalt-space-md h-3.5 w-3.5" />}
                Regenerate Token
              </Button>
              <Badge tone="neutral">Bearer token</Badge>
            </div>
          </div>
        </LayerCard.Body>
      </LayerCard>

      <LayerCard>
        <LayerCard.Header>
          <div className="flex w-full items-start justify-between gap-basalt-layout">
            <div>
              <h2 className="text-basalt-lg font-semibold">AI Agent Prompt</h2>
              <p className="text-basalt-sm text-basalt-muted-foreground">Copy this prompt into your AI agent&apos;s instructions.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void onShowPrompt()} disabled={promptLoading}>
              {promptLoading ? <Loader2 className="mr-basalt-space-md h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-basalt-space-md h-3.5 w-3.5" />}
              {promptText ? "Refresh" : "Generate"}
            </Button>
          </div>
        </LayerCard.Header>
        {promptText ? (
          <LayerCard.Body>
            <div className="relative">
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-basalt-md bg-basalt-control p-basalt-card font-mono text-basalt-sm text-basalt-foreground">{promptText}</pre>
              <Button variant="outline" size="sm" className="absolute right-basalt-space-lg top-basalt-space-lg" aria-label="Copy AI agent prompt" onClick={() => void onCopy(promptText, "prompt")}>
                {copied === "prompt" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </LayerCard.Body>
        ) : null}
      </LayerCard>
    </div>
  );
}
