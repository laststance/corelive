/**
 * Default skill tree template: "Backend Developer Core".
 * A subset of roadmap.sh Backend Developer Roadmap. 28 nodes grouped
 * into 6 clusters, laid out as a constellation. Node positions are
 * normalized (x, y ∈ [0, 1]) so the canvas can resize without DB updates.
 */
export const BACKEND_DEVELOPER_CORE_TEMPLATE = {
  key: 'backend-developer-core',
  name: 'Backend Developer Core',
  nodes: [
    // ─── Cluster 1: Foundations (top-left) ───
    { slug: 'internet', name: 'Internet', icon: 'globe', x: 0.1, y: 0.1 },
    { slug: 'http', name: 'HTTP', icon: 'network', x: 0.2, y: 0.18 },
    { slug: 'dns', name: 'DNS', icon: 'server', x: 0.05, y: 0.22 },
    { slug: 'terminal', name: 'Terminal', icon: 'terminal', x: 0.15, y: 0.3 },
    { slug: 'git', name: 'Git', icon: 'git-branch', x: 0.25, y: 0.32 },

    // ─── Cluster 2: Languages (top-right) ───
    { slug: 'javascript', name: 'JavaScript', icon: 'code', x: 0.75, y: 0.12 },
    { slug: 'python', name: 'Python', icon: 'code', x: 0.88, y: 0.18 },
    { slug: 'go', name: 'Go', icon: 'code', x: 0.82, y: 0.28 },
    { slug: 'rust', name: 'Rust', icon: 'code', x: 0.68, y: 0.25 },

    // ─── Cluster 3: Databases (middle-left) ───
    { slug: 'sql', name: 'SQL', icon: 'database', x: 0.1, y: 0.5 },
    {
      slug: 'postgres',
      name: 'PostgreSQL',
      icon: 'database',
      x: 0.22,
      y: 0.52,
    },
    { slug: 'redis', name: 'Redis', icon: 'zap', x: 0.08, y: 0.62 },
    { slug: 'mongodb', name: 'MongoDB', icon: 'leaf', x: 0.22, y: 0.65 },

    // ─── Cluster 4: APIs (center) ───
    { slug: 'rest', name: 'REST APIs', icon: 'send', x: 0.48, y: 0.45 },
    { slug: 'graphql', name: 'GraphQL', icon: 'git-merge', x: 0.55, y: 0.55 },
    { slug: 'grpc', name: 'gRPC', icon: 'radio', x: 0.42, y: 0.58 },
    { slug: 'auth', name: 'Auth', icon: 'key', x: 0.5, y: 0.35 },

    // ─── Cluster 5: Architecture (middle-right) ───
    { slug: 'caching', name: 'Caching', icon: 'layers', x: 0.78, y: 0.48 },
    {
      slug: 'queues',
      name: 'Message Queues',
      icon: 'list-ordered',
      x: 0.88,
      y: 0.55,
    },
    { slug: 'scaling', name: 'Scaling', icon: 'trending-up', x: 0.72, y: 0.6 },
    {
      slug: 'microservices',
      name: 'Microservices',
      icon: 'box',
      x: 0.85,
      y: 0.7,
    },

    // ─── Cluster 6: Operations (bottom) ───
    { slug: 'docker', name: 'Docker', icon: 'container', x: 0.3, y: 0.8 },
    { slug: 'k8s', name: 'Kubernetes', icon: 'cloud', x: 0.42, y: 0.88 },
    {
      slug: 'ci-cd',
      name: 'CI/CD',
      icon: 'git-pull-request',
      x: 0.55,
      y: 0.82,
    },
    {
      slug: 'monitoring',
      name: 'Monitoring',
      icon: 'activity',
      x: 0.65,
      y: 0.9,
    },
    { slug: 'security', name: 'Security', icon: 'shield', x: 0.5, y: 0.95 },

    // ─── Cluster 7: Testing (bottom-left) ───
    {
      slug: 'unit-tests',
      name: 'Unit Tests',
      icon: 'check-circle',
      x: 0.15,
      y: 0.88,
    },
    {
      slug: 'integration-tests',
      name: 'Integration Tests',
      icon: 'check-square',
      x: 0.22,
      y: 0.78,
    },
  ],
  /** Edges reference nodes by slug — resolved to node IDs at import time. */
  edges: [
    // Foundations
    ['internet', 'http'],
    ['internet', 'dns'],
    ['http', 'rest'],
    ['terminal', 'git'],

    // Languages → APIs
    ['javascript', 'rest'],
    ['python', 'rest'],
    ['go', 'grpc'],
    ['rust', 'microservices'],

    // APIs
    ['rest', 'auth'],
    ['rest', 'graphql'],
    ['graphql', 'grpc'],

    // Databases
    ['sql', 'postgres'],
    ['postgres', 'rest'],
    ['redis', 'caching'],
    ['mongodb', 'rest'],

    // Architecture
    ['caching', 'scaling'],
    ['queues', 'microservices'],
    ['scaling', 'microservices'],

    // Ops
    ['docker', 'k8s'],
    ['k8s', 'scaling'],
    ['ci-cd', 'docker'],
    ['monitoring', 'k8s'],
    ['security', 'auth'],

    // Testing
    ['unit-tests', 'integration-tests'],
    ['integration-tests', 'ci-cd'],
  ] as const satisfies ReadonlyArray<readonly [string, string]>,
} as const

export type SkillTreeTemplate = typeof BACKEND_DEVELOPER_CORE_TEMPLATE
