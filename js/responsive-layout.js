// Adapt to usable viewport space, orientation and input, including split-screen.
const root=document.documentElement;
const touch=matchMedia('(pointer: coarse)');
function updateLayout(){
 const width=document.documentElement.clientWidth;
 root.dataset.device=width<600?'mobile':width<1100?'tablet':'desktop';
 root.dataset.input=touch.matches?'touch':'pointer';
 root.dataset.orientation=innerWidth>innerHeight?'landscape':'portrait';
}
let pending;
window.addEventListener('resize',()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(updateLayout);});
touch.addEventListener('change',updateLayout);
updateLayout();
document.addEventListener('keydown',event=>{
 if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key)||!event.target.closest('.rail .tab'))return;
 const buttons=[...document.querySelectorAll('.rail .tab')];const index=buttons.indexOf(event.target.closest('.tab'));
 const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
 event.preventDefault();buttons[next]?.focus();
});
