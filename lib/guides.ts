export interface GuideEntry {
    slug: string;
    title: string;
    description: string;
}

/** Single source of truth for the guides list — index page, sitemap and feed all map over it. */
export const guides: GuideEntry[] = [
    {
        slug: 'jvm-memory-beyond-the-heap',
        title: 'Why your JVM uses more memory than -Xmx',
        description: 'Everything a Java process keeps outside the heap — metaspace, code cache, thread stacks, GC structures, direct buffers — and how to size a container for all of it.',
    },
    {
        slug: 'choosing-a-gc-for-containers',
        title: 'Choosing a garbage collector for containers',
        description: 'Serial, Parallel, G1 or ZGC? How pod size, CPU limits and latency requirements pick the collector — and what each one costs in memory.',
    },
    {
        slug: 'reading-nmt-output',
        title: 'Reading Native Memory Tracking output',
        description: 'How to enable NMT, capture a summary with jcmd, understand reserved vs committed and every category, and turn the numbers into a container limit.',
    },
    {
        slug: 'maxrampercentage-done-right',
        title: 'MaxRAMPercentage done right',
        description: 'How the JVM sizes the heap from the container limit, why the default 25% and hand-picked percentages both fail, and how to compute a percentage you can trust.',
    },
    {
        slug: 'oomkilled-troubleshooting',
        title: 'OOMKilled troubleshooting checklist',
        description: 'Exit code 137 on a Java pod: how to tell kernel kills from JVM OutOfMemoryError, and a step-by-step checklist to find which memory region blew the limit.',
    },
    {
        slug: 'virtual-threads-memory',
        title: 'What virtual threads change about memory',
        description: 'Heap-allocated stacks, carrier threads collapsing to the core count, and why a service sized for 200 platform threads gets a different memory profile after migrating.',
    },
    {
        slug: 'metaspace-deep-dive',
        title: 'Metaspace, demystified',
        description: 'What class metadata actually costs, why a ~1 GiB reservation is normal, what MetaspaceSize really does, and how to hunt classloader leaks with NMT and jcmd.',
    },
    {
        slug: 'glibc-malloc-arenas',
        title: 'glibc malloc arenas: the RSS nobody accounts for',
        description: 'Why thread-heavy JVMs show RSS far above what NMT reports, how per-thread arenas multiply, and when MALLOC_ARENA_MAX=2 or jemalloc is the fix.',
    },
    {
        slug: 'cds-aot-startup-memory',
        title: 'CDS, AOT cache and startup memory',
        description: 'How class-data sharing and the JDK 24/25 AOT cache trade disk and shared memory for faster startup, including the Spring Boot training-run flow.',
    },
];
