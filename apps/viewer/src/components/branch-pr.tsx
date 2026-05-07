import { GitBranch, GitPullRequest, GitCommit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { shortSha } from '@/lib/format';

type Props = {
  branch?: string | null;
  prNumber?: number | null;
  commitSha?: string | null;
  ciRunUrl?: string | null;
  className?: string;
};

export function BranchPr({
  branch,
  prNumber,
  commitSha,
  ciRunUrl,
  className,
}: Props) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {prNumber != null && (
        <Badge variant="accent">
          <GitPullRequest className="h-3 w-3" />
          PR #{prNumber}
        </Badge>
      )}
      {branch && (
        <Badge variant="outline">
          <GitBranch className="h-3 w-3" />
          {branch}
        </Badge>
      )}
      {commitSha && (
        <Badge variant="outline" className="font-mono">
          <GitCommit className="h-3 w-3" />
          {shortSha(commitSha)}
        </Badge>
      )}
      {ciRunUrl && (
        <a
          href={ciRunUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-fg-subtle underline-offset-2 hover:text-fg-muted hover:underline"
        >
          CI ↗
        </a>
      )}
    </div>
  );
}
