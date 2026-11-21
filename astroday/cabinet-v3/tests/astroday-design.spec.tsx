import React from "react";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import AstrodayDesign from "../src/astroday-design";

describe("ASTRODAY 3.0 design navigation",()=>{
  afterEach(()=>cleanup());
  function openPage(){
    render(<AstrodayDesign/>);
    return within(screen.getByRole("navigation",{name:"Разделы ASTRODAY"}));
  }
  it("shows five accessible sections and opens each without a reload",()=>{
    const nav=openPage();
    expect(screen.getByRole("heading",{name:/Мой день/})).toBeTruthy();
    const tabs=["Мой день","Календарь","Моя карта","Профиль","Доступ"];
    expect(nav.getAllByRole("button").length).toBe(5);
    for(const tab of tabs){
      fireEvent.click(nav.getByRole("button",{name:tab}));
      expect(screen.getByRole("heading",{name:new RegExp(tab),level:1})).toBeTruthy();
      expect(nav.getByRole("button",{name:tab}).getAttribute("aria-current")).toBe("page");
    }
  });
  it("calendar allows an accessible date selection and handles locked dates",()=>{
    const nav=openPage();
    fireEvent.click(nav.getByRole("button",{name:"Календарь"}));
    const current=screen.getByRole("button",{name:/21 ноября 2026.*открыть/});
    expect((current as HTMLButtonElement).disabled).toBeFalse();
    const locked=screen.getByRole("button",{name:/16 ноября 2026.*недоступно/});
    expect((locked as HTMLButtonElement).disabled).toBeTrue();
    fireEvent.click(screen.getByRole("button",{name:/23 ноября 2026.*открыть/}));
    expect(screen.getByText("Твой прогноз на 23 ноября")).toBeTruthy();
  });
  it("profile edits only the preview state and checkout stays unavailable",()=>{
    const nav=openPage();
    fireEvent.click(nav.getByRole("button",{name:"Профиль"}));
    fireEvent.change(screen.getByLabelText("Время доставки"),{target:{value:"09:35"}});
    fireEvent.click(screen.getByRole("button",{name:"Сохранить настройки"}));
    expect(screen.getByRole("status").textContent).toContain("в этом предпросмотре");
    fireEvent.click(nav.getByRole("button",{name:"Доступ"}));
    expect((screen.getByRole("button",{name:/Оплата в демо отключена/}) as HTMLButtonElement).disabled).toBeTrue();
  });
});
