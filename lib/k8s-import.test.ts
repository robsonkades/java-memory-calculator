import { describe, expect, it } from 'vitest';
import { parseK8sInput, quantityToMiB } from './k8s-import';

const DEPLOYMENT_YAML = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: app
          image: registry.local/orders:1.4.2
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "2"
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: prod
            - name: JAVA_TOOL_OPTIONS
              value: "-XX:MaxRAMPercentage=70.0 -XX:+UseG1GC -Xss1m"
        - name: istio-proxy
          image: istio/proxyv2:1.24.0
`;

const DESCRIBE_OUTPUT = `
Name:         orders-7d9f8b6c5-x2lqp
Namespace:    prod
Containers:
  app:
    Image:      registry.local/orders:1.4.2
    Limits:
      cpu:     2
      memory:  512Mi
    Requests:
      cpu:      500m
      memory:   512Mi
    Environment:
      SPRING_PROFILES_ACTIVE:  prod
      JAVA_TOOL_OPTIONS:       -Xmx384m -XX:+UseSerialGC
`;

describe('quantityToMiB', () => {
    it('converts Kubernetes quantities to whole MiB', () => {
        expect(quantityToMiB('1Gi')).toBe(1024);
        expect(quantityToMiB('512Mi')).toBe(512);
        expect(quantityToMiB('1024M')).toBe(977); // 1024 * 10^6 bytes = 976.56 MiB
        expect(quantityToMiB('2G')).toBe(1907);
        expect(quantityToMiB('1048576')).toBe(1); // plain bytes
        expect(quantityToMiB('nonsense')).toBeUndefined();
    });
});

describe('parseK8sInput', () => {
    it('extracts limit, flags and container names from Deployment YAML', () => {
        const result = parseK8sInput(DEPLOYMENT_YAML)!;

        expect(result.limitMiB).toBe(1024);
        expect(result.flagsLine).toBe('-XX:MaxRAMPercentage=70.0 -XX:+UseG1GC -Xss1m');
        expect(result.containers).toEqual(['app', 'istio-proxy']);
    });

    it('does not confuse env entry names with container names', () => {
        const result = parseK8sInput(DEPLOYMENT_YAML)!;
        expect(result.containers).not.toContain('JAVA_TOOL_OPTIONS');
        expect(result.containers).not.toContain('SPRING_PROFILES_ACTIVE');
    });

    it('extracts limit and flags from kubectl describe output', () => {
        const result = parseK8sInput(DESCRIBE_OUTPUT)!;

        expect(result.limitMiB).toBe(512);
        expect(result.flagsLine).toBe('-Xmx384m -XX:+UseSerialGC');
        expect(result.containers).toContain('app');
    });

    it('takes the first memory limit when several containers set one', () => {
        const twoLimits = DEPLOYMENT_YAML.replace(
            'image: istio/proxyv2:1.24.0',
            'image: istio/proxyv2:1.24.0\n          resources:\n            limits:\n              memory: "128Mi"',
        );
        expect(parseK8sInput(twoLimits)!.limitMiB).toBe(1024);
    });

    it('returns a result when only one of limit/flags is present', () => {
        const onlyLimit = parseK8sInput('resources:\n  limits:\n    memory: "256Mi"')!;
        expect(onlyLimit.limitMiB).toBe(256);
        expect(onlyLimit.flagsLine).toBeUndefined();
    });

    it('returns null for text with neither limit nor flags', () => {
        expect(parseK8sInput('')).toBeNull();
        expect(parseK8sInput('kind: Service\nmetadata:\n  name: orders')).toBeNull();
    });
});
