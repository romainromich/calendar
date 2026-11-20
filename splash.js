/* заставка «Барабан»: раз за сессию, цвета из темы */
(function(){var s=document.getElementById('splash');
try{if(sessionStorage.getItem('splash')){s.remove();return;}sessionStorage.setItem('splash','1');}catch(e){}
var d=new Date(),days=['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
s.querySelector('.sp-dn').textContent=days[d.getDay()];s.querySelector('.sp-nm').textContent=d.getDate();
try{var c=JSON.parse(localStorage.getItem('calendar.v1')||'{}').settings.colors;if(c&&c.accent){s.style.setProperty('--sa',c.accent);s.style.setProperty('--sb',c.a2||'#A78BFA');if(c.bg)s.style.setProperty('--sbg',c.bg);}}catch(e){}
function done(){if(s.parentNode){s.classList.add('out');setTimeout(function(){if(s.parentNode)s.remove();},450);}}
setTimeout(done,1750);s.addEventListener('click',done);})();
