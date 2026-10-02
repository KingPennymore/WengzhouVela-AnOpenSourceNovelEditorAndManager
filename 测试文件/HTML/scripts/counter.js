let count = 0;
const button = document.querySelector('#count');
document.querySelector('#status').textContent = '本地脚本已运行';
button.addEventListener('click', () => { count += 1; button.textContent = '点击计数：' + count; });
