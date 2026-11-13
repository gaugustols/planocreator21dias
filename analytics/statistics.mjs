export function wilson(successes,n,z=1.959963984540054) {
  if(!n)return {low:0,high:1,n:0};
  const p=Math.min(n,Math.max(0,successes))/n,z2=z*z,denom=1+z2/n,center=(p+z2/(2*n))/denom,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/denom;
  return {low:Math.max(0,center-half),high:Math.min(1,center+half),n};
}
export const median=values=>{if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
export const pct=(x,n)=>n?Math.round(x/n*1000)/10:0;
export function bottleneck({successes,n,visits,reached,baseline,downstream=0,peer=null}) {
  const interval=wilson(successes,n),rate=n?successes/n:0;
  const lossPerThousand=visits?Math.max(0,baseline-rate)*reached/visits*1000:0;
  const belowBaseline=n>=20&&interval.high<baseline;
  const belowPeers=!!peer&&n>=20&&peer.n>=20&&interval.high<wilson(peer.successes,peer.n).low;
  const flag=(belowBaseline||belowPeers)&&lossPerThousand>=10;
  return {flag,rate,baseline,interval,lossPerThousand,estimatedClicksPerThousand:lossPerThousand*downstream,belowBaseline,belowPeers,sampleReady:n>=20};
}
