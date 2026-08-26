export const diagramIcons = {
  server: { label: "Server", group: "Compute", markup: '<rect x="3.5" y="4.5" width="17" height="6" rx="1.8"></rect><rect x="3.5" y="13.5" width="17" height="6" rx="1.8"></rect><circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none"></circle><circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none"></circle><path d="M11 7.5h6M11 16.5h6"></path>' },
  cluster: { label: "Cluster", group: "Compute", markup: '<rect x="3" y="3.5" width="7" height="7" rx="1.6"></rect><rect x="14" y="3.5" width="7" height="7" rx="1.6"></rect><rect x="8.5" y="13.5" width="7" height="7" rx="1.6"></rect><path d="M10 7h4M9.6 10.5l1.6 3M14.4 10.5l-1.6 3"></path>' },
  orchestrator: { label: "Orchestrator", group: "Compute", markup: '<path d="M16.25 4.64L20.5 12l-4.25 7.36h-8.5L3.5 12l4.25-7.36z"></path><circle cx="12" cy="12" r="2.6"></circle><path d="M12 9.4V6M14.3 13.3l2.5 1.5M9.7 13.3l-2.5 1.5"></path>' },
  container: { label: "Container", group: "Compute", markup: '<rect x="3.5" y="6.5" width="17" height="11" rx="1.8"></rect><path d="M3.5 9.5h17M8.5 12.5v3M12 12.5v3M15.5 12.5v3"></path>' },
  chip: { label: "Compute node", group: "Compute", markup: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"></rect><path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3"></path>' },
  worker: { label: "Worker", group: "Compute", markup: '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"></path>' },
  fn: { label: "Function", group: "Compute", markup: '<path d="M13.5 3.5L6 13h5l-1.5 7.5L18 11h-5z"></path>' },
  database: { label: "Database", group: "Data", markup: '<ellipse cx="12" cy="6" rx="7.5" ry="3"></ellipse><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"></path><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"></path>' },
  cache: { label: "Cache", group: "Data", markup: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><path d="M9 8.5l3.5 3.5L9 15.5M14 8.5l3.5 3.5L14 15.5"></path>' },
  bucket: { label: "Object store", group: "Data", markup: '<path d="M3.5 7h17l-1.7 11.6a2 2 0 0 1-2 1.7H7.2a2 2 0 0 1-2-1.7z"></path><path d="M3.5 7c0-1.93 3.8-3.5 8.5-3.5S20.5 5.07 20.5 7"></path><path d="M9 11.5l.7 5M15 11.5l-.7 5"></path>' },
  queue: { label: "Queue", group: "Data", markup: '<path d="M4 7v10M8 7v10M12 7v10"></path><path d="M15.5 12h4.5M17.5 9.5L20 12l-2.5 2.5"></path>' },
  bus: { label: "Event bus", group: "Data", markup: '<path d="M2.5 6h19"></path><path d="M6 6v4M12 6v4M18 6v4"></path><rect x="3.5" y="10" width="5" height="4.5" rx="1.2"></rect><rect x="9.5" y="10" width="5" height="4.5" rx="1.2"></rect><rect x="15.5" y="10" width="5" height="4.5" rx="1.2"></rect>' },
  index: { label: "Search index", group: "Data", markup: '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.2 15.2L21 21"></path><path d="M8 9h5M8 12h3.5"></path>' },
  repo: { label: "Repository", group: "Data", markup: '<circle cx="7" cy="6" r="2.5"></circle><circle cx="7" cy="18" r="2.5"></circle><circle cx="17" cy="12" r="2.5"></circle><path d="M7 8.5v7M14.5 12H9.5"></path>' },
  gateway: { label: "API gateway", group: "Network", markup: '<path d="M5 20V9.5a7 7 0 0 1 14 0V20"></path><path d="M9 20v-9a3 3 0 0 1 6 0v9"></path><path d="M3 20h18"></path>' },
  balancer: { label: "Load balancer", group: "Network", markup: '<circle cx="5" cy="12" r="2.3"></circle><circle cx="19" cy="6" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="19" cy="18" r="2"></circle><path d="M7.3 12h4.2M11.5 12l5.5-5.5M11.5 12h5.5M11.5 12l5.5 5.5"></path>' },
  cdn: { label: "CDN / edge", group: "Network", markup: '<circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17"></path><path d="M12 3.5c2.5 2.3 3.8 5.3 3.8 8.5S14.5 18.2 12 20.5C9.5 18.2 8.2 15.2 8.2 12S9.5 5.8 12 3.5z"></path>' },
  router: { label: "Router / DNS", group: "Network", markup: '<circle cx="5" cy="7" r="2"></circle><circle cx="5" cy="17" r="2"></circle><circle cx="19" cy="12" r="2"></circle><path d="M7 7h5a2 2 0 0 1 2 2v1M7 17h5a2 2 0 0 0 2-2v-1M14 12h3"></path>' },
  firewall: { label: "Firewall", group: "Network", markup: '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z"></path><path d="M9 12l2.2 2.2L15.5 10"></path>' },
  vault: { label: "Secrets", group: "Network", markup: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.2"></rect><path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path><circle cx="12" cy="15.2" r="1.4"></circle>' },
  dashboard: { label: "Dashboard", group: "Observability", markup: '<rect x="3" y="4" width="18" height="16" rx="2.2"></rect><path d="M3 8.5h18"></path><path d="M6.5 16l3-3.5 2.5 2 3.5-4.5 2 2.5"></path>' },
  metrics: { label: "Metrics", group: "Observability", markup: '<path d="M4 20h16"></path><path d="M7.5 20v-6M12 20v-11M16.5 20v-8"></path>' },
  logs: { label: "Logs", group: "Observability", markup: '<rect x="4.5" y="3" width="15" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h4.5"></path>' },
  alert: { label: "Alerting", group: "Observability", markup: '<path d="M12 4.5l8.5 15H3.5z"></path><path d="M12 10v4"></path><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"></circle>' },
  pipeline: { label: "Pipeline / CI", group: "Observability", markup: '<rect x="2.5" y="9" width="5.5" height="6" rx="1.5"></rect><rect x="16" y="9" width="5.5" height="6" rx="1.5"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M8 12h1.5M14.5 12H16"></path>' },
  cron: { label: "Scheduler", group: "Observability", markup: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3.5 2.2"></path>' },
  person: { label: "User", group: "Client", markup: '<circle cx="12" cy="8" r="3.8"></circle><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"></path>' },
  browser: { label: "Web client", group: "Client", markup: '<rect x="3" y="4.5" width="18" height="15" rx="2.2"></rect><path d="M3 9h18"></path><circle cx="6.5" cy="6.8" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="9.5" cy="6.8" r="0.9" fill="currentColor" stroke="none"></circle>' },
  mobile: { label: "Mobile", group: "Client", markup: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"></rect><path d="M10.5 18.5h3"></path>' },
  email: { label: "Email", group: "Client", markup: '<rect x="2.5" y="5" width="19" height="14" rx="2.2"></rect><path d="M3.5 7l8.5 6 8.5-6"></path>' },
} as const;

export type DiagramIconKind = keyof typeof diagramIcons;

export const diagramIconCatalog = Object.entries(diagramIcons).map(([id, icon]) => ({
  id: id as DiagramIconKind,
  label: icon.label,
  group: icon.group,
}));

export function diagramIconMarkup(kind: DiagramIconKind) {
  return diagramIcons[kind].markup;
}

export function isDiagramIconKind(value: unknown): value is DiagramIconKind {
  return typeof value === "string" && value in diagramIcons;
}
