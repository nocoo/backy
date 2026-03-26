import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Integration</CardTitle>
          <CardDescription>
            Use these credentials to send backups from your AI agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                aria-label="Copy webhook URL"
                onClick={() => void onCopy(webhookUrl, "webhook")}
                className="shrink-0"
              >
                {copied === "webhook" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Authorization Token</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground">
                {!webhookToken ? (
                  "Token hidden - regenerate to view"
                ) : tokenVisible ? (
                  webhookToken
                ) : (
                  "•".repeat(24)
                )}
              </code>
              <Button
                variant="outline"
                size="sm"
                aria-label={tokenVisible ? "Hide authorization token" : "Show authorization token"}
                onClick={onToggleTokenVisible}
                className="shrink-0"
                disabled={!webhookToken}
              >
                {tokenVisible ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Copy authorization token"
                onClick={() => void onCopy(webhookToken, "token")}
                className="shrink-0"
                disabled={!webhookToken}
              >
                {copied === "token" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onRegenerateToken()}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Regenerate Token
              </Button>
              <Badge variant="secondary">Bearer token</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Agent Prompt</CardTitle>
          <CardDescription>
            Copy this prompt into your AI agent&apos;s instructions.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onShowPrompt()}
              disabled={promptLoading}
            >
              {promptLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {promptText ? "Refresh" : "Generate"}
            </Button>
          </CardAction>
        </CardHeader>
        {promptText && (
          <CardContent>
            <div className="relative">
              <pre className="max-h-[400px] overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-4 text-xs font-mono text-foreground">
                {promptText}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                aria-label="Copy AI agent prompt"
                onClick={() => void onCopy(promptText, "prompt")}
              >
                {copied === "prompt" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
