import React from "react";
import {describe,it,expect,afterEach} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {JieCaiExperience} from "../components/JieCaiExperience";
describe("BaZi resources UX",()=>{
 afterEach(()=>cleanup());
 it("renders a personal deterministic calendar",()=>{
  render(<JieCaiExperience/>);
  expect(screen.getByText(/Грабителя/)).toBeTruthy();
  expect(screen.getByLabelText("Дата рождения")).toBeTruthy();
  expect(screen.getAllByRole("button",{name:/основной день/}).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button",{name:/фоновый день/}).length).toBeGreaterThan(0);
 });
 it("opens a date explanation and calculation method",()=>{
  render(<JieCaiExperience/>);
  fireEvent.click(screen.getAllByRole("button",{name:/основной день/})[0]);
  expect(screen.getByText(/Небесный ствол дня совпадает/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:/Как это рассчитано/}));
  expect(screen.getByText(/60-дневный цикл/)).toBeTruthy();
 });
 it("recalculates when the birth date changes, without live checkout",()=>{
  render(<JieCaiExperience/>);
  const before=screen.getByText(/Грабитель богатства:/).textContent;
  fireEvent.change(screen.getByLabelText("Дата рождения"),{target:{value:"2000-01-01"}});
  expect(screen.getByText(/Грабитель богатства:/).textContent).not.toBe(before);
  expect(screen.queryByRole("button",{name:/Оплатить/i})).toBeNull();
 });
});
