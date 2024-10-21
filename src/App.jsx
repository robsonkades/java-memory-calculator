import { useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DetailedMemoryCalculator() {
    const [heapSize, setHeapSize] = useState(512);
    const [threads, setThreads] = useState(50);
    const [classes, setClasses] = useState(10000);
    const [targetUtilization, setTargetUtilization] = useState(80);

    // Heap Memory
    const youngGen = Math.ceil(heapSize * 0.33);
    const oldGen = heapSize - youngGen;

    // Non-Heap Memory
    const metaspace = Math.ceil(classes * 0.007);
    const codeCache = 240;
    const threadStacks = threads * 1;
    const compressedClassSpace = Math.ceil(classes * 0.002);
    const totalNonHeap = metaspace + codeCache + threadStacks + compressedClassSpace;

    // Other Memory
    const directBuffers = Math.ceil(heapSize * 0.1);
    const nativeMemory = Math.ceil((heapSize + totalNonHeap) * 0.05);
    const jvmOverhead = Math.ceil(heapSize * 0.05);
    const totalOther = directBuffers + nativeMemory + jvmOverhead;

    // Total
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

    // eslint-disable-next-line react/prop-types
    const Card = ({ title, children, bgColor = 'bg-white' }) => (
        <div className={`border rounded-lg shadow-lg ${bgColor} overflow-hidden`}>
            <div className="px-4 py-2 font-semibold bg-gray-100 border-b">{title}</div>
            <div className="p-4">{children}</div>
        </div>
    );

    const JvmParameters = () => (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border">
            <h2 className="text-xl font-bold">Recommended JVM Parameters</h2>
            <ul className="list-disc list-inside mt-4">
                <li><span className="font-bold">-Xms:</span> {Math.floor(heapSize * 0.5)}MB (Initial Heap Memory)</li>
                <li><span className="font-bold">-Xmx:</span> {heapSize}MB (Maximum Heap Memory)</li>
                <li><span className="font-bold">-Xss:</span> 1MB (Stack Size per Thread)</li>
                <li><span className="font-bold">-XX:MetaspaceSize:</span> {metaspace}MB (Initial Metaspace Size)</li>
                <li><span className="font-bold">-XX:MaxMetaspaceSize:</span> {metaspace}MB (Maximum Metaspace Size)</li>
                <li><span className="font-bold">-XX:CompressedClassSpaceSize:</span> {compressedClassSpace}MB</li>
            </ul>
        </div>
    );

    const KubernetesRecommendations = () => {
        const requestMemory = Math.ceil(total * 0.75);
        const limitMemory = total;
        const cpuRequest = Math.ceil(threads * 0.1);
        const cpuLimit = Math.ceil(threads * 0.2);
        return (
            <div className="mt-6 p-4 bg-green-50 rounded-lg border">
                <h2 className="text-xl font-bold">Recommendations for Kubernetes Configuration</h2>
                <h3 className="text-lg font-semibold mt-4">Requests & Limits</h3>
                <ul className="list-disc list-inside mt-2">
                    <li><span className="font-bold">Memory Request:</span> {requestMemory}Mi</li>
                    <li><span className="font-bold">Memory Limit:</span> {limitMemory}Mi</li>
                    <li><span className="font-bold">CPU Request:</span> {cpuRequest} cores</li>
                    <li><span className="font-bold">CPU Limit:</span> {cpuLimit} cores</li>
                </ul>
            </div>
        );
    };

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
                <h1 className="text-2xl font-bold mb-6">Java Memory Calculator</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
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
                            <label className="block font-medium mb-1">Target Utilization (%):</label>
                            <input
                                type="number"
                                value={targetUtilization}
                                onChange={(e) => setTargetUtilization(Number(e.target.value))}
                                className="w-full p-2 border rounded focus:ring focus:ring-blue-300"
                            />
                        </div>
                    </div>

                    <Card title="Memory Distribution">
                        <Pie data={pieData} />
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <Card title={`Heap Memory: ${heapSize}MB`} bgColor="bg-blue-50">
                        <div>Young Generation: {youngGen}MB</div>
                        <div>Old Generation: {oldGen}MB</div>
                    </Card>
                    <Card title={`Non-Heap Memory: ${totalNonHeap}MB`} bgColor="bg-red-50">
                        <div>Metaspace: {metaspace}MB</div>
                        <div>Code Cache: {codeCache}MB</div>
                        <div>Thread Stacks: {threadStacks}MB</div>
                        <div>Compressed Class: {compressedClassSpace}MB</div>
                    </Card>
                    <Card title={`Other Memory: ${totalOther}MB`} bgColor="bg-green-50">
                        <div>Direct Buffers: {directBuffers}MB</div>
                        <div>Native Memory: {nativeMemory}MB</div>
                        <div>JVM Overhead: {jvmOverhead}MB</div>
                    </Card>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <div className="text-xl font-bold">Total Recommended Memory: {total}MB</div>
                    <div className="text-sm text-gray-600">Includes safety margin of {safetyMargin} MB (10%)</div>
                </div>

                <div className="mt-6">
                    <JvmParameters />
                    <KubernetesRecommendations />
                </div>
            </div>
        </div>
    );
}
