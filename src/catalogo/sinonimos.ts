/**
 * Diccionario de sinónimos bilingüe (es-MX / es / en) y regional para el buscador.
 * Cada línea es un grupo: todos los términos se consideran equivalentes al buscar.
 * Un término de varias palabras exige todas sus palabras. Se normaliza con `tokenizar` al cargar.
 * Usado por el cliente (expansión de la consulta) y por el pipeline (pruebas / términos de marcas).
 */
const GRUPOS = `
platano|banana|banano|guineo|bananas
platano macho|plantain|platano para freir
jitomate|tomate rojo|tomato|tomate saladet|tomate bola
tomate verde|tomatillo|tomate de cascara|miltomate
elote|maiz|mazorca|corn|choclo|maiz dulce|sweet corn
esquite|corn cup|elote desgranado
puerco|cerdo|pork|cochino|marrano|chancho
res|carne de res|beef|vacuno|ternera|bistec de res
pollo|chicken|gallina
pavo|guajolote|turkey|chompipe
borrego|cordero|lamb|carnero|mutton
chivo|cabrito|cabra|goat
conejo|rabbit
venado|venison|ciervo
pescado|fish
camaron|camarones|shrimp|gamba|langostino
pulpo|octopus
calamar|squid
jaiba|cangrejo|crab
langosta|lobster
ostion|ostra|oyster
almeja|clam
mejillon|mussel
atun|tuna
salmon|salmon
sardina|sardine
tilapia|mojarra
huachinango|pargo|red snapper|snapper
robalo|bass|sea bass
bacalao|cod
leche|milk
leche deslactosada|deslactosada|lactose free|lactosa free|sin lactosa|lactose-free
leche descremada|descremada|skim|nonfat|fat free|sin grasa|light
leche semidescremada|semidescremada|reduced fat|low fat|lowfat
leche entera|whole milk|entera
leche evaporada|evaporated milk
leche condensada|condensed milk|lechera
crema|cream|nata
crema acida|sour cream|jocoque
media crema|half and half|media crema
mantequilla|butter|manteca de vaca
margarina|margarine
manteca|lard|manteca de cerdo
queso|cheese|quesillo
queso oaxaca|quesillo|string cheese|queso de hebra
queso fresco|fresh cheese|queso blanco|queso ranchero|queso de rancho
queso panela|queso de panela
queso cotija|cotija|queso anejo
queso manchego|manchego
queso chihuahua|chihuahua|menonita|queso menonita
queso amarillo|american cheese|queso americano|queso procesado|processed cheese
queso crema|cream cheese|philadelphia
requeson|ricotta|cottage cheese|queso cottage
queso parmesano|parmesan|parmesano
queso mozzarella|mozzarella|mozarela
queso cheddar|cheddar
queso asadero|asadero
yogur|yogurt|yoghurt|yogourt
yogur griego|greek yogurt|griego
huevo|egg|blanquillo|blanquillos
clara de huevo|egg white|clara
yema|yolk|egg yolk
frijol|frijoles|bean|beans|judia|alubia|poroto|habichuela|caraota
frijol negro|black bean|black beans|frijoles negros
frijol pinto|pinto bean|pinto beans|frijol bayo|bayo
frijoles refritos|refried beans|refritos
frijol de soya|soya|soy|soja|soybean
garbanzo|chickpea|garbanzos|chick pea
lenteja|lentil|lentejas
haba|fava|habas|broad bean|fava bean
chicharo|chicharos|pea|peas|guisante|arveja|petit pois
ejote|ejotes|green bean|green beans|judia verde|vainita|habichuela verde|string bean|snap bean
camote|sweet potato|batata|boniato|yam
papa|patata|potato|papas
papas fritas|french fries|fries|papitas|chips|potato chips
betabel|remolacha|beet|beets|betarraga|beetroot
cacahuate|cacahuete|mani|peanut|peanuts|cacahuates
mantequilla de cacahuate|crema de cacahuate|peanut butter|crema de mani
nuez|nueces|walnut|walnuts|pecan|pecans|nuez pecana|nuez encarcelada
almendra|almond|almonds|almendras
avellana|hazelnut
pistache|pistacho|pistachio
nuez de la india|anacardo|cashew|maranon|castana de caju
semilla de girasol|pepita de girasol|sunflower seed
pepita|pepitas|pumpkin seed|semilla de calabaza
chia|semilla de chia|chia seed
linaza|flaxseed|flax seed|lino
ajonjoli|sesamo|sesame
durazno|melocoton|peach|peaches|duraznos
chabacano|albaricoque|apricot|damasco
ciruela|plum|prune|ciruela pasa
cereza|cherry|cherries|guinda
fresa|frutilla|strawberry|strawberries|fresas
frambuesa|raspberry
zarzamora|mora|blackberry|zarzamoras
arandano|blueberry|mora azul|arandanos
arandano rojo|cranberry
uva|grape|uvas|grapes
pasa|pasas|raisin|raisins|uva pasa
manzana|apple|apples|manzanas
pera|pear|pears
naranja|orange|oranges|naranjas
mandarina|tangerine|clementine|mandarin
limon|lime|limones|limon verde
limon amarillo|lemon|limon real|limon eureka
toronja|pomelo|grapefruit
pina|anana|ananas|pineapple
mango|mangos|mango ataulfo|mango manila
papaya|lechosa|fruta bomba
sandia|watermelon|patilla
melon|cantaloupe|cantaloup|muskmelon
melon verde|honeydew|melon chino
guayaba|guava|guayabas
tuna|nopal fruit|prickly pear|higo chumbo
mamey|zapote mamey|mamey sapote
zapote|sapote|zapote negro
chicozapote|sapodilla|chico zapote
pitaya|pitahaya|dragon fruit|fruta del dragon
granada|pomegranate
higo|fig|higos|breva
datil|date|dates|datiles
coco|coconut|cocos
kiwi|kiwifruit|kiwis
maracuya|passion fruit|fruta de la pasion|parchita
tamarindo|tamarind
jicama|yam bean|jicamas|mexican turnip
aguacate|avocado|palta|aguacates
guacamole|guacamole
nopal|nopales|cactus|cactus pads|nopalitos
chayote|chayotes|christophine|chuchu|mirliton
calabacita|calabacitas|zucchini|calabacin|courgette|summer squash
calabaza|squash|pumpkin|zapallo|ayote|auyama
flor de calabaza|squash blossom|pumpkin flower
huitlacoche|cuitlacoche|corn smut|corn fungus
chile|chili|aji|hot pepper|chiles
chile jalapeno|jalapeno|jalapenos|cuaresmeno|chile cuaresmeno
chile serrano|serrano|serranos
chile poblano|poblano|poblanos|chile ancho|ancho
chile chipotle|chipotle|chipotles
chile habanero|habanero
chile guajillo|guajillo
chile pasilla|pasilla
chile de arbol|arbol
pimiento|pimiento morron|bell pepper|sweet pepper|chile morron|morron|paprika
cebolla|onion|onions|cebollas
cebollin|cebolla cambray|green onion|scallion|cebolleta|spring onion
ajo|garlic|ajos
cilantro|coriander|culantro
perejil|parsley
epazote|epazote
oregano|oregano
hierbabuena|menta|mint|peppermint|spearmint
albahaca|basil
lechuga|lettuce|lechugas
espinaca|spinach|espinacas
acelga|chard|swiss chard|acelgas
col|repollo|cabbage|coles
col morada|repollo morado|red cabbage
coliflor|cauliflower
brocoli|broccoli|brecol
zanahoria|carrot|carrots|zanahorias
pepino|cucumber|pepinos
rabano|radish|rabanos
apio|celery
champinon|champinones|hongo|hongos|seta|setas|mushroom|mushrooms
berenjena|eggplant|aubergine
esparrago|asparagus|esparragos
alcachofa|artichoke
verdolaga|purslane|verdolagas
quelite|quelites|lambsquarters
romeritos|romerito|seepweed
nabo|turnip
poro|puerro|leek
jengibre|ginger
arroz|rice
arroz blanco|white rice
arroz integral|brown rice|arroz cafe
arroz rojo|arroz a la mexicana|mexican rice|spanish rice
avena|oat|oats|oatmeal|hojuelas de avena
trigo|wheat
harina|flour
harina de maiz|masa harina|maseca|corn flour|cornmeal
masa|masa de maiz|corn dough|nixtamal
tortilla|tortillas
tortilla de maiz|corn tortilla
tortilla de harina|flour tortilla|tortilla de trigo
tostada|tostadas|tostada shell
totopo|totopos|tortilla chip|tortilla chips|nachos|chips de tortilla
pan|bread|panes
pan blanco|white bread|pan de caja|pan de molde|sandwich bread
pan integral|whole wheat bread|whole grain bread|pan de trigo integral
bolillo|bolillos|pan frances|french roll|birote|pan blanco de sal
telera|teleras|pan para torta|torta roll
pan dulce|sweet bread|sweet roll|pastry|pan de dulce
concha|conchas|pan concha|pan dulce con cobertura de azucar
cuerno|croissant|cuernito
dona|donas|donut|doughnut|dough nut
galleta|galletas|cookie|cookies|biscuit|cracker|crackers
galleta salada|saltine|saltines|soda cracker
pastel|cake|torta dulce|bizcocho|queque
hot cake|hotcake|hotcakes|pancake|pancakes|panqueque
waffle|waffles|wafle
pasta|noodle|noodles|fideo|fideos|spaghetti|espagueti|macaroni|macarrones|tallarin
sopa de pasta|sopa de fideo|noodle soup|fideo seco
cereal|cereales|cereal de caja|cornflakes|corn flakes|hojuelas de maiz
granola|granola
palomitas|palomitas de maiz|popcorn|crispetas|cotufas|pochoclo
azucar|sugar|azucar blanca|azucar refinada
azucar morena|brown sugar|piloncillo|panela de azucar|chancaca|panocha
miel|honey|miel de abeja
miel de maple|maple syrup|jarabe de maple|jarabe
chocolate|cocoa|cacao|chocolates
chocolate de mesa|chocolate abuelita|chocolate ibarra|chocolate para beber
cajeta|dulce de leche|cajeta de celaya|arequipe
gelatina|jello|gelatin|jelly
mermelada|jam|jalea|preserves|marmalade
helado|ice cream|nieve|nieves|paleta helada
paleta|popsicle|paleta de hielo|ice pop
refresco|soda|gaseosa|soft drink|pop|cola|coca|coca cola|refrescos
agua mineral|sparkling water|carbonated water|agua con gas|topo chico
agua|water|agua natural
jugo|juice|zumo|jugos
jugo de naranja|orange juice|zumo de naranja
licuado|smoothie|batido|licuados|shake|milkshake|malteada
cafe|coffee|cafecito|espresso|expreso
cafe con leche|latte|cafe latte|coffee with milk
capuchino|cappuccino
te|tea|infusion|tisana
cerveza|beer|chela|cheve|lager|ale
vino|wine
tequila|tequila
mezcal|mezcal
ron|rum
vodka|vodka
whisky|whiskey
atole|atoles|atole de maiz
champurrado|atole de chocolate
horchata|agua de horchata|rice drink
agua de jamaica|jamaica|hibiscus|flor de jamaica|hibiscus tea|roselle
agua de tamarindo|tamarind drink
agua fresca|aguas frescas|agua de sabor|fruit water
tejuino|tejuino
pulque|pulque
aceite|oil|aceites
aceite de oliva|olive oil|oliva
aceite vegetal|vegetable oil|aceite de cocina
aceite de canola|canola oil|canola
mayonesa|mayonnaise|mayo
mostaza|mustard
catsup|ketchup|catchup|salsa de tomate
salsa|sauce|salsas
salsa verde|green sauce|salsa de tomate verde|green salsa
salsa roja|red sauce|red salsa|salsa de jitomate
salsa picante|hot sauce|valentina|tapatio|salsa botanera
pico de gallo|salsa mexicana|salsa fresca|salsa bandera
mole|mole poblano|mole negro|mole rojo
pipian|mole verde|pipian verde
adobo|adobado|adobada
vinagre|vinegar
sal|salt
pimienta|black pepper|pimienta negra
canela|cinnamon
vainilla|vanilla
consome|caldo|broth|stock|consomme|bouillon
caldo de pollo|chicken broth|chicken stock|consome de pollo|chicken soup
caldo de res|beef broth|beef stock|beef soup|cocido|puchero
sopa|soup|sopas
crema de verduras|cream soup
tocino|bacon|tocineta|panceta
jamon|ham|jamones
salchicha|sausage|hot dog|frankfurter|wiener|salchichas|vienna
chorizo|chorizo|longaniza
salami|salami
peperoni|pepperoni
mortadela|bologna|mortadella|bolonia
chicharron|chicharrones|pork rind|pork rinds|cracklings|pork crackling
carnitas|carnitas|pork carnitas
barbacoa|barbacoa|barbecue|bbq|barbacoa de res|barbacoa de borrego
birria|birria|birria de res|birria de chivo
carne asada|grilled steak|asada|arrachera|carne asada
arrachera|skirt steak|flank steak|falda|fajita
bistec|bistek|steak|beefsteak|filete
carne molida|ground beef|picadillo|molida|hamburger meat|minced meat|ground meat
milanesa|breaded cutlet|empanizado|milanesas|schnitzel
hamburguesa|hamburger|burger|hamburguesas|cheeseburger
pizza|pizzas
sandwich|sandwiches|emparedado|sandwichon
torta|tortas|mexican sandwich
taco|tacos|tacos de
taco al pastor|al pastor|pastor|tacos al pastor|trompo
taco de suadero|suadero
taco de tripa|tripa|tripitas|tripe
taco de lengua|lengua|tongue|beef tongue
taco de cabeza|cabeza|beef head|cachete
taco dorado|tacos dorados|flauta|flautas|taquito|taquitos|rolled taco
burrito|burritos|burro
quesadilla|quesadillas
sincronizada|sincronizadas
gordita|gorditas
sope|sopes
huarache|huaraches
tlayuda|tlayudas
tlacoyo|tlacoyos
tamal|tamales|tamale|tamales
enchilada|enchiladas
enfrijolada|enfrijoladas
enmolada|enmoladas
entomatada|entomatadas
chilaquiles|chilaquil
pozole|posole|hominy stew
menudo|pancita|mondongo|tripe soup
mole de olla|beef vegetable soup|mole de olla
tinga|tinga de pollo|tinga
cochinita pibil|cochinita|pibil
machaca|machacado|carne seca|dried beef|beef jerky|cecina
cecina|salted beef|tasajo
chile relleno|chiles rellenos|stuffed pepper|chile relleno
chiles en nogada|chile en nogada
huevos rancheros|huevos rancheros
huevos a la mexicana|huevo a la mexicana|scrambled eggs mexican style
huevo revuelto|huevos revueltos|scrambled egg|scrambled eggs
huevo estrellado|huevo frito|fried egg|huevos estrellados
huevo cocido|huevo duro|hard boiled egg|hard-boiled egg
omelet|omelette|tortilla de huevo
nachos|nachos con queso
elote preparado|elote con mayonesa|mexican street corn|elote asado
quesadilla de huitlacoche|huitlacoche
sopa de tortilla|sopa azteca|tortilla soup
caldo tlalpeno|caldo tlalpeno
pescado a la veracruzana|veracruzana|huachinango a la veracruzana
ceviche|cebiche|seviche
coctel de camaron|shrimp cocktail|coctel de mariscos|campechana
aguachile|aguachile
empanada|empanadas
churro|churros
bunuelo|bunuelos|fritter
arroz con leche|rice pudding
flan|flan napolitano|custard|creme caramel
pan de muerto|pan de muertos
rosca de reyes|rosca
polvoron|polvorones|mantecada|mantecadas|magdalena|muffin|panque|panquecito|cupcake
tostada de pata|pata|cueritos|pickled pork skin
nopales en ensalada|ensalada de nopales|cactus salad
ensalada|salad|ensaladas
verdura|verduras|vegetal|vegetales|vegetable|vegetables|legumbre
fruta|frutas|fruit|fruits
carne|meat|carnes
pechuga|breast|pechuga de pollo|chicken breast
muslo|thigh|pierna|leg|drumstick|chamorro
ala|alas|wing|wings|alitas
costilla|costillas|rib|ribs|spare ribs
lomo|loin|tenderloin|lomo de cerdo|pork loin
chuleta|chop|chuletas|pork chop
higado|liver
rinon|kidney
moronga|morcilla|blood sausage
picaña|picana|sirloin|aguayon|top sirloin
bisteces|bistec
pollo rostizado|rotisserie chicken|pollo asado|roasted chicken|pollo al carbon
pollo frito|fried chicken|pollo empanizado
nugget|nuggets|chicken nuggets|nuggets de pollo
atun en lata|canned tuna|atun enlatado
sardina en lata|canned sardines
proteina en polvo|protein powder|whey|proteina whey
barra de proteina|protein bar|barrita|barra
barra de granola|granola bar|cereal bar
botana|snack|snacks|botanas|antojito
papitas|potato chip|sabritas
frituras|cheetos|chetos|corn snack|puffs
cacahuates japoneses|japanese peanuts
gomitas|gummies|gummy|gummy bears|ositos de goma
dulce|candy|caramelo|dulces|golosina
bombon|marshmallow|malvavisco
pure de papa|mashed potatoes|pure de papas
pure de tomate|tomato puree|tomato sauce|salsa de tomate
crema de cacahuate|peanut butter
leche de almendra|almond milk|bebida de almendra
leche de soya|soy milk|soymilk|bebida de soya
leche de coco|coconut milk
leche de avena|oat milk|bebida de avena
agua de coco|coconut water
bebida energetica|energy drink|red bull|monster
bebida deportiva|sports drink|gatorade|powerade|electrolit|suero oral
tofu|tofu|queso de soya
seitan|seitan
hummus|humus|hummus
cuitlacoche|huitlacoche
amaranto|amaranth|alegria|alegrias
quinoa|quinua|quinoa
maicena|cornstarch|fecula de maiz|almidon de maiz
polvo para hornear|baking powder|royal
levadura|yeast
bicarbonato|baking soda
`;

export type GrupoSinonimos = string[];

/** Grupos crudos (texto sin normalizar), un grupo por línea. */
export const GRUPOS_SINONIMOS: GrupoSinonimos[] = GRUPOS.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => [...new Set(l.split('|').map((x) => x.trim()).filter(Boolean))]);
