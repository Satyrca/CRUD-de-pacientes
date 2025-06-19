const express = require("express");
const app = express();
const mysql = require("mysql2");
const cors = require("cors");

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "1234",
    database: "empleados_crud"
});


app.post("/create", (req, res) =>{
    const nombre = req.body.nombre;
    const edad = req.body.edad;
    const pais = req.body.pais;
    const cargo = req.body.cargo;
    const anios = req.body.anios;

    db.query('INSERT INTO empleados(nombre, edad, pais, cargo, anios) VALUES(?,?,?,?,?)', [nombre, edad, pais, cargo, anios],
        (err) => {
            if(err){
                console.log(err);
            }else{
                res.send("Empleado registrado con éxito");
            }
        }
    )
});


app.get('/empleados', (req, res) => {
  db.query("SELECT * FROM empleados", (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error en el servidor");
      return;
    }
    res.send(result);
  });
});


app.put("/update", (req, res) =>{
    const id = req.body.id;
    const nombre = req.body.nombre;
    const edad = req.body.edad;
    const pais = req.body.pais;
    const cargo = req.body.cargo;
    const anios = req.body.anios;

    db.query('UPDATE empleados SET nombre=?, edad=?, pais=?, cargo=?, anios=? WHERE id=?', [nombre, edad, pais, cargo, anios, id],
        (err) => {
            if(err){
                console.log(err);
            }else{
                res.send("Empleado actualizado con éxito");
            }
        }
    )
});

app.delete("/delete/:id", (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM empleados WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error al eliminar el empleado");
    } else {
      res.send("Empleado eliminado con éxito");
    }
  });
});

app.listen(3001, ()=>{
    console.log("Running on the port 3001")
})