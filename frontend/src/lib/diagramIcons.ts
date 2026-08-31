const iconBasePath = "/diagram-icons/cloud-native";

type DiagramIconDefinition = {
  label: string;
  group: string;
  src: string;
  w: number;
  h: number;
  visible?: boolean;
};

function icon(src: string, label: string, group: string, w = 92, h = 108, visible = true): DiagramIconDefinition {
  return { src: `${iconBasePath}/${src}`, label, group, w, h, visible };
}

export const diagramIcons = {
  server: icon("server.svg", "Server", "Core", 92, 108),
  "server-rack": icon("server-rack.svg", "Server rack", "Core", 92, 108),
  "virtual-machine": icon("virtual-machine.svg", "Virtual machine", "Core", 92, 108),
  service: icon("service.svg", "Service", "Core", 92, 108),
  client: icon("internet.svg", "Client", "Core", 96, 112),
  container: icon("container.svg", "Container", "Core", 88, 104),
  function: icon("function.svg", "Function", "Core", 88, 104),

  "k8s-node": icon("k8s-node.svg", "Node", "Kubernetes", 92, 108),
  "k8s-deployment": icon("k8s-deployment.svg", "Deployment", "Kubernetes", 86, 102),
  "k8s-pod": icon("k8s-pod.svg", "Pod", "Kubernetes", 86, 102),
  "k8s-service": icon("k8s-service.svg", "Service", "Kubernetes", 86, 102),
  "k8s-ingress": icon("k8s-ingress.svg", "Ingress", "Kubernetes", 86, 102),
  "k8s-statefulset": icon("k8s-statefulset.svg", "StatefulSet", "Kubernetes", 86, 102),
  "k8s-configmap": icon("k8s-configmap.svg", "ConfigMap", "Kubernetes", 86, 102),
  "k8s-secret": icon("k8s-secret.svg", "Secret", "Kubernetes", 86, 102),

  postgresql: icon("postgresql.svg", "PostgreSQL", "Data", 92, 108),
  redis: icon("redis.svg", "Redis", "Data", 92, 108),
  minio: icon("minio.svg", "MinIO", "Data", 92, 108),
  "object-storage": icon("object-storage.svg", "Object storage", "Data", 92, 108),
  nats: icon("nats.svg", "NATS", "Data", 92, 108),

  "load-balancer": icon("load-balancer.svg", "Load balancer", "Network", 96, 112),
  dns: icon("dns.svg", "DNS", "Network", 92, 108),
  internet: icon("internet.svg", "Internet", "Network", 96, 112),

  kubernetes: icon("kubernetes.svg", "Kubernetes", "Cloud", 104, 114),
  aws: icon("aws.svg", "AWS", "Cloud", 104, 114),
  azure: icon("azure.svg", "Azure", "Cloud", 104, 114),
  gcp: icon("gcp.svg", "GCP", "Cloud", 104, 114),

  "container-registry": icon("container-registry.svg", "Container registry", "Delivery", 92, 108),
  "code-repository": icon("code-repository.svg", "Code repository", "Delivery", 92, 108),
  "deployment-pipeline": icon("deployment-pipeline.svg", "Deployment pipeline", "Delivery", 96, 112),
  terraform: icon("terraform.svg", "Terraform", "Delivery", 92, 108),
  helm: icon("helm.svg", "Helm", "Delivery", 92, 108),

  prometheus: icon("prometheus.svg", "Prometheus", "Observability", 92, 108),
  grafana: icon("grafana.svg", "Grafana", "Observability", 92, 108),
  alertmanager: icon("alertmanager.svg", "Alertmanager", "Observability", 92, 108),

  cluster: icon("kubernetes.svg", "Cluster", "Cloud", 104, 114, false),
  orchestrator: icon("kubernetes.svg", "Orchestrator", "Cloud", 104, 114, false),
  chip: icon("k8s-node.svg", "Compute node", "Kubernetes", 92, 108, false),
  worker: icon("container.svg", "Worker", "Core", 88, 104, false),
  fn: icon("function.svg", "Function", "Core", 88, 104, false),
  database: icon("postgresql.svg", "Database", "Data", 92, 108, false),
  cache: icon("redis.svg", "Cache", "Data", 92, 108, false),
  bucket: icon("object-storage.svg", "Object store", "Data", 92, 108, false),
  queue: icon("nats.svg", "Queue", "Data", 92, 108, false),
  bus: icon("nats.svg", "Event bus", "Data", 92, 108, false),
  index: icon("object-storage.svg", "Search index", "Data", 92, 108, false),
  repo: icon("code-repository.svg", "Repository", "Delivery", 92, 108, false),
  gateway: icon("load-balancer.svg", "API gateway", "Network", 96, 112, false),
  balancer: icon("load-balancer.svg", "Load balancer", "Network", 96, 112, false),
  cdn: icon("internet.svg", "CDN / edge", "Network", 96, 112, false),
  router: icon("dns.svg", "Router / DNS", "Network", 92, 108, false),
  firewall: icon("k8s-secret.svg", "Firewall", "Network", 86, 102, false),
  vault: icon("k8s-secret.svg", "Secrets", "Network", 86, 102, false),
  dashboard: icon("grafana.svg", "Dashboard", "Observability", 92, 108, false),
  metrics: icon("prometheus.svg", "Metrics", "Observability", 92, 108, false),
  logs: icon("grafana.svg", "Logs", "Observability", 92, 108, false),
  alert: icon("alertmanager.svg", "Alerting", "Observability", 92, 108, false),
  pipeline: icon("deployment-pipeline.svg", "Pipeline / CI", "Delivery", 96, 112, false),
  cron: icon("deployment-pipeline.svg", "Scheduler", "Delivery", 96, 112, false),
  browser: icon("internet.svg", "Web client", "Core", 96, 112, false),
  person: icon("internet.svg", "User", "Core", 96, 112, false),
  mobile: icon("internet.svg", "Mobile", "Core", 96, 112, false),
  email: icon("internet.svg", "Email", "Core", 96, 112, false),
} as const;

export type DiagramIconKind = keyof typeof diagramIcons;

export const diagramIconDefinitions = Object.entries(diagramIcons).map(([id, definition]) => ({
  id: id as DiagramIconKind,
  ...definition,
}));

export const diagramIconCatalog = diagramIconDefinitions.filter((icon) => icon.visible !== false);

export function diagramIconHref(kind: DiagramIconKind) {
  return diagramIcons[kind].src;
}

export function diagramIconSize(kind: DiagramIconKind) {
  const icon = diagramIcons[kind];
  return { w: icon.w, h: icon.h };
}

export function isDiagramIconKind(value: unknown): value is DiagramIconKind {
  return typeof value === "string" && value in diagramIcons;
}
