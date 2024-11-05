import {useState} from 'react';
import {Pie} from 'react-chartjs-2';
import {ArcElement, Chart as ChartJS, Legend, Tooltip} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DetailedMemoryCalculator() {
    const [heapSize, setHeapSize] = useState(512);
    const [threads, setThreads] = useState(50);
    const [classes, setClasses] = useState(10000);
    const [targetUtilization, setTargetUtilization] = useState(75);
    const [stackSizePerThread, setStackSizePerThread] = useState(1);
    const [codeCache, setCodeCache] = useState(240);
    const [maxDirectMemorySize, setMaxDirectMemorySize] = useState(10);
    const [gcType, setGCType] = useState('G1');

    // Heap Memory calculations updated for Java 21
    const youngGen = Math.ceil(heapSize * (gcType === 'G1' ? 0.40 : 0.25));
    const oldGen = heapSize - youngGen;

    // Non-Heap Memory calculations refined
    const metaspace = Math.ceil(classes * 0.005);
    const threadStacks = threads * stackSizePerThread;
    const compressedClassSpace = Math.ceil(classes * 0.0015);
    const totalNonHeap = metaspace + codeCache + threadStacks + compressedClassSpace;

    // Other Memory calculations updated
    const nativeMemory = Math.ceil((heapSize + totalNonHeap) * 0.03);
    const jvmOverhead = Math.ceil(heapSize * 0.03);
    const totalOther = maxDirectMemorySize + nativeMemory + jvmOverhead;

    // Total with safety margin
    const subtotal = heapSize + totalNonHeap + totalOther;
    const safetyMargin = Math.ceil(subtotal * 0.1);
    const total = subtotal + safetyMargin;

    // Pie Chart Data
    const pieData = {
        labels: ['Heap', 'Non-Heap', 'Other', 'Safety Margin'],
        datasets: [
            {
                data: [heapSize, totalNonHeap, totalOther, safetyMargin],
                backgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56'],
                hoverBackgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCE56'],
            },
        ],
    };

    const TooltipLabel = ({text, tooltip}) => (
        <div className="group relative inline-block">
            <div className="inline-flex items-center">
                {text}
            </div>
            <div
                className="invisible group-hover:visible absolute z-10 w-64 bg-black text-white text-sm rounded-lg py-2 px-3 -right-2 top-full mt-1 shadow-lg">
                {tooltip}
                <div className="absolute -top-1 right-3 w-2 h-2 bg-black transform rotate-45"/>
            </div>
        </div>
    );

    const JvmParameters = () => {
        const g1Settings = gcType === 'G1' ? (
            <>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:+UseG1GC</span>}
                        tooltip="The G1 is the default garbage collector in Java 21. It is a low-latency collector that divides the heap into regions, ideal for heaps larger than 4GB and applications requiring predictable pause times."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span
                            className="font-bold">-XX:G1NewSizePercent={Math.floor(youngGen / heapSize * 100)}%</span>}
                        tooltip="Sets the minimum size of the young generation for G1. A higher value can improve throughput but increases memory usage. The default value is 5%, but applications with high object allocation may benefit from higher values."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:MaxGCPauseMillis=200</span>}
                        tooltip="Sets the maximum pause time goal for G1 collections in milliseconds. G1 will attempt to adjust its behavior to keep pauses below this value. A lower value results in shorter pauses but may reduce throughput."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span
                            className="font-bold">-XX:G1HeapRegionSize={Math.max(1, Math.floor(heapSize / 2048))}m</span>}
                        tooltip="Sets the size of G1 regions. The value must be a power of 2 and is calculated based on the heap size. Smaller regions allow for better memory management but increase overhead."
                    />
                </li>
            </>
        ) : (
            <>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:+UseZGC</span>}
                        tooltip="ZGC is a scalable, low-latency garbage collector that keeps pauses below 1ms regardless of heap size. It is ideal for applications that need consistent response times and can utilize more CPU and memory."
                    />
                </li>
                <li className="my-2">
                    <TooltipLabel
                        text={<span className="font-bold">-XX:ZAllocationSpikeTolerance=2</span>}
                        tooltip="Controls how much extra space ZGC reserves for allocation spikes. A higher value increases tolerance for spikes but uses more memory. A value of 2 is a good balance for most applications."
                    />
                </li>
            </>
        );

        return (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border">
                <h2 className="text-xl font-bold">Recommended JVM Parameters for Java 21</h2>
                <ul className="list-disc list-inside mt-4">
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-Xms{Math.floor(heapSize * 0.7)}m -Xmx{heapSize}m</span>}
                            tooltip="Sets the minimum and maximum heap sizes. Making them equal reduces memory reallocations. It is recommended to set Xms to 70% of Xmx to allow dynamic adjustments without wasting initial memory."
                        />
                    </li>
                    {g1Settings}
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-Xss{stackSizePerThread}M</span>}
                            tooltip="Sets the stack size for each thread. The default value is usually sufficient. Increase it if you encounter StackOverflowError exceptions or deep recursion."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:ReservedCodeCacheSize={codeCache}m</span>}
                            tooltip="Space reserved for JIT-compiled code. Important for applications that use a lot of dynamic code or have many classes. Increase it if you see messages about a full code cache."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:MaxDirectMemorySize={maxDirectMemorySize}m</span>}
                            tooltip="Maximum limit for direct memory (NIO). Important for applications that use a lot of NIO or Netty. A value that is too high can cause native OOM issues."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:MaxMetaspaceSize={Math.ceil(metaspace * 1.5)}m</span>}
                            tooltip="Maximum size of Metaspace. It limits growth to prevent OOM. A value that is too low can cause ClassLoader errors, while a value that is too high can excessively consume native memory."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span
                                className="font-bold">-XX:CompressedClassSpaceSize={compressedClassSpace}m</span>}
                            tooltip="Space for compressed class pointers. Part of Metaspace, it helps reduce memory usage in applications with many classes."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">--enable-preview</span>}
                            tooltip="Enables preview features of Java 21. Useful for testing new functionalities but not recommended for production unless necessary."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:+UseStringDeduplication</span>}
                            tooltip="Optimizes memory usage by eliminating duplicate Strings. Very useful for applications that manipulate many similar strings, such as web services."
                        />
                    </li>
                    <li className="my-2">
                        <TooltipLabel
                            text={<span className="font-bold">-XX:+UseCompressedOops</span>}
                            tooltip="Compresses pointers to ordinary objects. Significantly reduces memory usage in heaps smaller than 32GB. Enabled by default, but it's good to specify."
                        />
                    </li>
                </ul>
            </div>
        );
    };

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
                <h1 className="text-2xl font-bold mb-6">Java 21 Memory Calculator</h1>

                <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-4">
                    <p className="text-blue-700">
                        Optimized for Java 21 with support for G1 and ZGC garbage collectors.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block font-medium mb-1">Garbage Collector:</label>
                            <select
                                value={gcType}
                                onChange={(e) => setGCType(e.target.value)}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            >
                                <option value="G1">G1 GC (Recommended)</option>
                                <option value="ZGC">Z GC (Low latency)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Desired Heap (MB):</label>
                            <input
                                type="number"
                                value={heapSize}
                                onChange={(e) => setHeapSize(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Number of Threads:</label>
                            <input
                                type="number"
                                value={threads}
                                onChange={(e) => setThreads(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Number of Classes:</label>
                            <input
                                type="number"
                                value={classes}
                                onChange={(e) => setClasses(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Reserved Code Cache (MB):</label>
                            <input
                                type="number"
                                value={codeCache}
                                onChange={(e) => setCodeCache(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                        <div>
                            <label className="block font-medium mb-1">Direct Memory Size (MB):</label>
                            <input
                                type="number"
                                value={maxDirectMemorySize}
                                onChange={(e) => setMaxDirectMemorySize(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-4">Memory Distribution</h2>
                        <Pie data={pieData}/>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Heap Memory: {heapSize}MB</h2>
                        <div>Young Generation: {youngGen}MB</div>
                        <div>Old Generation: {oldGen}MB</div>
                    </div>

                    <div className="bg-red-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Non-Heap Memory: {totalNonHeap}MB</h2>
                        <div>Metaspace: {metaspace}MB</div>
                        <div>Code Cache: {codeCache}MB</div>
                        <div>Thread Stacks: {threadStacks}MB</div>
                        <div>Compressed Class: {compressedClassSpace}MB</div>
                    </div>

                    <div className="bg-green-50 rounded-lg shadow p-4">
                        <h2 className="text-lg font-semibold mb-2">Other Memory: {totalOther}MB</h2>
                        <div>Direct Buffers: {maxDirectMemorySize}MB</div>
                        <div>Native Memory: {nativeMemory}MB</div>
                        <div>JVM Overhead: {jvmOverhead}MB</div>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <div className="text-xl font-bold">Recommended Total Memory: {total}MB</div>
                    <div className="text-sm text-gray-600">Includes a safety margin of {safetyMargin}MB (10%)</div>
                </div>

                <JvmParameters/>
            </div>
        </div>
    );
}