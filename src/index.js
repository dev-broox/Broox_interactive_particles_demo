import { WebrtcSkeletonController, KeyValue } from './lib/settings.js';
import { VisionNodeClient } from './lib/visionNode.js';

(async () => {
  const response = await fetch('./config/config.json');
  const config = await response.json();
  var canvas = document.querySelector("#scene"),
  ctx = canvas.getContext("2d"),
  particles = [],
  amount = 0,
  mouse = { x: 0, y: 0 },
  hands = [{ x: -1, y: -1 }, { x: -1, y: -1 }],
  inputWidth = 0,
  inputHeight = 0;
  var ww = canvas.width = window.innerWidth;
  var wh = canvas.height = window.innerHeight;

  // skeleton settings
  const controller = new WebrtcSkeletonController(document.body.clientWidth, document.body.clientHeight, () => {}, onSettingsChanged);
  const keyValue = new KeyValue();
  const settings = keyValue.getValue('textToParticles', 'settings');
  if(settings && settings != {}) {
    controller.setActiveArea(settings.activeArea.x, settings.activeArea.y, settings.activeArea.width, settings.activeArea.height);
    controller.setScale(settings.handScale, settings.bodyScale);
    controller.setColor(settings.handColor, settings.bodyColor);
    controller.setHandSize(settings.handSize);
  }
  else {
    controller.setHandSize(300);
    controller.setScale(2, 1);
  }

  // Vision Node config
  const vnConfig = {
    port: 5000,
    protocol: 'webRtc',
    onConnect: onConnect
  }
  // create Vision Node client
  const client = new VisionNodeClient(vnConfig);
  client.connect();

  function onSettingsChanged(settings) {
    keyValue.setValue('textToParticles', 'settings', settings);
    console.log('settings saved', settings);
  }

  function getDistance(joint1, joint2) {
    const x = joint1.x - joint2.x;
    const y = joint1.y - joint2.y;
    return Math.sqrt(x * x + y * y);
  }

  function getBodyBox(skeleton) {
    if(skeleton && skeleton.neck && (skeleton.rightHip || skeleton.leftHip)) {
      const neck = { x: skeleton.neck.x * inputWidth, y: skeleton.neck.y * inputHeight };
      const hip = { x: (skeleton.rightHip?.x || skeleton.leftHip?.x) * inputWidth, y: (skeleton.rightHip?.y || skeleton.leftHip?.y) * inputHeight };
      const scale = getDistance(neck, hip);
      const box = { x: neck.x - 1.5 * scale, y: (neck.y + 0.5 * scale) - 1.5 * scale, width: 3 * scale, height: 3 * scale };
      return { x: box.x / inputWidth, y: box.y / inputHeight, width: box.width / inputWidth, height: box.height / inputHeight };
    }
    return null;
  }

  function onConnect(client) {
    client.getConfig().then(config => {
      if(config.cameras.length) {
        const resolution = config.cameras[0].resolution.split('x');
        inputWidth = Number(resolution[0]);
        inputHeight = Number(resolution[1]);
        // get input resolution
        client.onChange(() => {
          const actors = client.getActors();
          if(!actors.length) {
            hands = [{x: -1, y: -1}, {x: -1, y: -1}];
            return;
          }
          let skeleton = null;
          let box = null;
          for(const a of actors) {
            const s = a.getSkeleton();
            if(s.leftWrist && s.rightWrist) {
              skeleton = s
              break;
            }
          }
          if(skeleton) {
            const box = getBodyBox(skeleton);
            if(box) {
              const leftHand = skeleton.leftWrist;
              if(leftHand && leftHand.x > 0 && leftHand.y > 0) {
                let x = (leftHand.x - box.x) / box.width;
                let y = (leftHand.y - box.y) / box.height;
                hands[0] = { x: x * ww, y: y * wh, width: controller.getHandSize() };
              }
              const rightHand = skeleton.rightWrist;
              if(rightHand && rightHand.x > 0 && rightHand.y > 0) {
                let x = (rightHand.x - box.x) / box.width;
                let y = (rightHand.y - box.y) / box.height;
                hands[1] = { x: x * ww, y: y * wh, width: controller.getHandSize() };
              }
            }
            controller.setSkeletons(actors.map(a => a.getSkeleton()));
          }
          else {
            hands = [{x: -1, y: -1}, {x: -1, y: -1}];
          }
        });
      }
    });
  }

  function Particle(x,y){
    this.x =  Math.random()*ww;
    this.y =  Math.random()*wh;
    this.dest = {
      x : x,
      y: y
    };
    this.r =  Math.random()*5 + 2;
    this.vx = (Math.random()-0.5)*20;
    this.vy = (Math.random()-0.5)*20;
    this.accX = 0;
    this.accY = 0;
    this.friction = Math.random()*0.05 + 0.94;
    this.color = config.colors[Math.floor(Math.random()*6)];
  }

  Particle.prototype.render = function() {
    this.accX = (this.dest.x - this.x)/1000;
    this.accY = (this.dest.y - this.y)/1000;
    this.vx += this.accX;
    this.vy += this.accY;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.x += this.vx;
    this.y +=  this.vy;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, Math.PI * 2, false);
    ctx.fill();
    for(let hand of hands) {
      if(hand.x > 0 && hand.y > 0) {
        var a = this.x - hand.x;
        var b = this.y - hand.y;
        var distance = Math.sqrt( a*a + b*b );
        if(distance<(hand.width)){
          this.accX = (this.x - hand.x)/100;
          this.accY = (this.y - hand.y)/100;
          this.vx += this.accX;
          this.vy += this.accY;
        }
      }
    }
  }

  function initScene(){
    ww = canvas.width = window.innerWidth;
    wh = canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold " + (ww/10) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(config.text, ww/2, wh/2);
    var data  = ctx.getImageData(0, 0, ww, wh).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "screen";
    particles = [];
    for(var i=0;i<ww;i+=Math.round(ww/150)){
      for(var j=0;j<wh;j+=Math.round(ww/150)){
        if(data[ ((i + j*ww)*4) + 3] > 150){
          particles.push(new Particle(i,j));
        }
      }
    }
    amount = particles.length;
  }

  function renderBox(box) {
    this.context.beginPath();
    this.context.rect(box.x, box.y, box.width, box.height);
    this.context.lineWidth = 2;
    this.context.strokeStyle = '#EEEEEE';
    this.context.stroke();
  }

  function render(a) {
    requestAnimationFrame(render);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < amount; i++) {
      particles[i].render();
    }
    for(let hand of hands) {
      if(hand.x >= 0 && hand.y >= 0) {
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, 100, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'red';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#003300';
        ctx.stroke();
      }
    }
  };

  window.addEventListener("resize", initScene);
  initScene();
  requestAnimationFrame(render);  
})()
  .catch(e => {
    console.log(e);
  });



