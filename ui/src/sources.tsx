import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import type { EdgeLinks, MachineLinks, SourceLink } from "./types";

const SourcesCtx = createContext<MachineLinks | null>(null);
export const SourcesProvider = SourcesCtx.Provider;
export const useSources = () => useContext(SourcesCtx);

// useMachineLinks fetches the links from a chart to its code. A machine with no
// known source yields null, and nothing source-related is drawn. Pass a new
// `rev` to fetch again after the machine was reloaded.
export function useMachineLinks(name: string, rev: unknown): MachineLinks | null {
  const [links, setLinks] = useState<MachineLinks | null>(null);
  useEffect(() => {
    let live = true;
    api
      .sources(name)
      .then((l) => live && setLinks(l.machine || l.nodes || l.edges ? l : null))
      .catch(() => live && setLinks(null));
    return () => {
      live = false;
    };
  }, [name, rev]);
  return links;
}

// edgeLink picks the most specific place a transition points at: the
// transition itself, else its guard, else its first located action.
export function edgeLink(l: EdgeLinks | undefined): SourceLink | undefined {
  return l?.self ?? l?.guard ?? l?.actions?.find((a) => !!a) ?? undefined;
}

export const shortFile = (link: SourceLink) => `${link.file.slice(link.file.lastIndexOf("/") + 1)}:${link.line}`;

// SourceButtons renders "open in editor" and "view on the code host" for one
// place in the code. Clicks never reach the chart underneath, where a click on
// a transition row sends its event.
export function SourceButtons({ link, label = false }: { link?: SourceLink | null; label?: boolean }) {
  if (!link || (!link.editor && !link.permalink)) return null;
  const where = shortFile(link);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <span className={`src${label ? " src-labelled" : ""}`} onClick={stop}>
      {link.editor && (
        <a className="src-btn" href={link.editor} title={`Open ${where} in your editor`} aria-label={`Open ${where} in your editor`}>
          <Icon name="code" size={label ? 14 : 12} />
          {label && <span>{where}</span>}
        </a>
      )}
      {link.permalink && (
        <a
          className="src-btn"
          href={link.permalink}
          target="_blank"
          rel="noreferrer"
          title={`View ${where} on the code host`}
          aria-label={`View ${where} on the code host`}
        >
          <Icon name="external" size={label ? 14 : 12} />
          {label && !link.editor && <span>{where}</span>}
        </a>
      )}
    </span>
  );
}
